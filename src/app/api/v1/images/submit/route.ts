import { websiteConfig } from '@/config/website';
import { consumeCredits } from '@/credits/credits';
import { InsufficientCreditsError } from '@/credits/errors';
import { getImageProvider } from '@/image';
import {
  createImageGeneration,
  updateImageGenerationById,
} from '@/image/data/image-generation';
import { refundImageCredits } from '@/image/utils/credits';
import { sanitizeProviderErrorMessage } from '@/image/utils/sanitize-provider-error';
import {
  markApiKeyUsed,
  parseBearerToken,
  validateApiKey,
} from '@/lib/api-keys';
import {
  buildExecutionContext,
  resolveExecutionForSurface,
} from '@/lib/generation/resolve-execution';
import { buildWebhookUrl } from '@/lib/urls/urls';
import { IMAGE_PRODUCTS } from '@/models/image-models';
import { NextResponse } from 'next/server';
import { logApiUsage } from '../../_lib/usage-log';

// Single source of truth: the API surface declares its accepted models
// in `website.tsx`. The `defaultModel` is what we assume when callers
// omit `model` in the request body.
const API_SURFACE = websiteConfig.generation.surfaces.api;
const DEFAULT_API_MODEL = API_SURFACE.defaultModel;
const ALLOWED_API_MODELS = new Set(API_SURFACE.allowedModels);
const MAX_PROMPT_LEN = 4000;
// apimart currently only supports n=1; we accept `n` but enforce the cap so
// the external contract is stable if apimart raises this later.
const MAX_N = 1;
const MIN_N = 1;
// apimart's real cap is 16 reference images.
const MAX_REFERENCE_IMAGES = 16;

// apimart-supported aspect ratios (13 values).
const ALLOWED_SIZES = new Set([
  '1:1',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '5:4',
  '4:5',
  '16:9',
  '9:16',
  '2:1',
  '1:2',
  '21:9',
  '9:21',
]);

// 4K is only valid for 6 of the ratios (total-pixel cap).
const ALLOWED_4K_SIZES = new Set([
  '16:9',
  '9:16',
  '2:1',
  '1:2',
  '21:9',
  '9:21',
]);

const ALLOWED_RESOLUTIONS = new Set(['1k', '2k', '4k']);

interface SubmitBody {
  prompt?: unknown;
  n?: unknown;
  /** Preferred apimart-native ratio field (e.g. "16:9"). */
  size?: unknown;
  /** Alias of `size` — accepted for backward compatibility. */
  aspect_ratio?: unknown;
  resolution?: unknown;
  output_format?: unknown;
  reference_images?: unknown;
  /** Also accept apimart-native `image_urls` as an alias. */
  image_urls?: unknown;
  model?: unknown;
}

function badRequest(message: string) {
  return NextResponse.json(
    { error: 'INVALID_INPUT', message },
    { status: 400 }
  );
}

export async function POST(request: Request) {
  // 1. Bearer auth
  const token = parseBearerToken(request.headers.get('authorization'));
  if (!token) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Missing Bearer token' },
      { status: 401 }
    );
  }

  const validated = await validateApiKey(token);
  if (!validated) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Invalid or revoked API key' },
      { status: 401 }
    );
  }

  // Fire-and-forget last-used update
  void markApiKeyUsed(validated.id).catch((err) =>
    console.error('[api/v1/submit] markApiKeyUsed failed:', err)
  );

  const userId = validated.userId;
  const apiKeyId = validated.id;

  // 2. Parse + validate input
  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    await logApiUsage({
      userId,
      apiKeyId,
      endpoint: 'submit',
      status: 'invalid_input',
      errorMessage: 'Invalid JSON body',
    });
    return badRequest('Request body must be valid JSON');
  }

  const prompt = body.prompt;
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    await logApiUsage({
      userId,
      apiKeyId,
      endpoint: 'submit',
      status: 'invalid_input',
      errorMessage: 'prompt required',
    });
    return badRequest('prompt is required and must be a non-empty string');
  }
  if (prompt.length > MAX_PROMPT_LEN) {
    await logApiUsage({
      userId,
      apiKeyId,
      endpoint: 'submit',
      status: 'invalid_input',
      errorMessage: 'prompt too long',
    });
    return badRequest(`prompt must be at most ${MAX_PROMPT_LEN} characters`);
  }

  let n = 1;
  if (body.n !== undefined && body.n !== null) {
    if (
      typeof body.n !== 'number' ||
      !Number.isInteger(body.n) ||
      body.n < MIN_N ||
      body.n > MAX_N
    ) {
      await logApiUsage({
        userId,
        apiKeyId,
        endpoint: 'submit',
        status: 'invalid_input',
        errorMessage: 'invalid n',
      });
      return badRequest(`n must be an integer between ${MIN_N} and ${MAX_N}`);
    }
    n = body.n;
  }

  // Surface allow-list: callers may pass any model in
  // `surfaces.api.allowedModels`; missing → DEFAULT_API_MODEL.
  let requestedModel = DEFAULT_API_MODEL;
  if (body.model !== undefined && body.model !== null) {
    if (typeof body.model !== 'string' || !ALLOWED_API_MODELS.has(body.model)) {
      await logApiUsage({
        userId,
        apiKeyId,
        endpoint: 'submit',
        status: 'invalid_input',
        errorMessage: `unsupported model ${String(body.model)}`,
      });
      const list = [...ALLOWED_API_MODELS].map((m) => `'${m}'`).join(', ');
      return badRequest(`Unsupported model. Allowed: ${list}.`);
    }
    requestedModel = body.model;
  }
  // Defense-in-depth: model.policy.requiresAuth must not block API
  // callers who already authenticated via bearer token, but if a model
  // is somehow listed on the API surface AND requires auth, that's a
  // config bug — surface it loudly rather than silently fail later.
  const productModel = IMAGE_PRODUCTS.find((p) => p.id === requestedModel);
  if (productModel?.policy.requiresAuth && !userId) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required.' },
      { status: 401 }
    );
  }

  // Accept either `reference_images` (our field) or apimart-native `image_urls`.
  const rawImages =
    body.reference_images !== undefined && body.reference_images !== null
      ? body.reference_images
      : body.image_urls !== undefined && body.image_urls !== null
        ? body.image_urls
        : undefined;

  let referenceImages: string[] | undefined;
  if (rawImages !== undefined) {
    if (!Array.isArray(rawImages)) {
      await logApiUsage({
        userId,
        apiKeyId,
        endpoint: 'submit',
        status: 'invalid_input',
        errorMessage: 'reference_images not array',
      });
      return badRequest('reference_images must be an array of URL strings');
    }
    if (rawImages.length > MAX_REFERENCE_IMAGES) {
      await logApiUsage({
        userId,
        apiKeyId,
        endpoint: 'submit',
        status: 'invalid_input',
        errorMessage: 'too many reference_images',
      });
      return badRequest(
        `reference_images may contain at most ${MAX_REFERENCE_IMAGES} items`
      );
    }
    for (const item of rawImages) {
      if (typeof item !== 'string' || item.trim().length === 0) {
        await logApiUsage({
          userId,
          apiKeyId,
          endpoint: 'submit',
          status: 'invalid_input',
          errorMessage: 'reference_images has non-string entry',
        });
        return badRequest('reference_images entries must be non-empty strings');
      }
    }
    referenceImages = rawImages as string[];
  }

  // Accept either `size` (apimart-native, preferred) or `aspect_ratio` (alias).
  const rawSize =
    typeof body.size === 'string'
      ? body.size
      : typeof body.aspect_ratio === 'string'
        ? body.aspect_ratio
        : undefined;
  let size: string | undefined;
  if (rawSize !== undefined) {
    const normalised = rawSize.trim();
    if (!ALLOWED_SIZES.has(normalised)) {
      await logApiUsage({
        userId,
        apiKeyId,
        endpoint: 'submit',
        status: 'invalid_input',
        errorMessage: `invalid size ${normalised}`,
      });
      return badRequest(
        `size must be one of: ${Array.from(ALLOWED_SIZES).join(', ')}`
      );
    }
    size = normalised;
  }

  let resolution: string | undefined;
  if (body.resolution !== undefined && body.resolution !== null) {
    if (typeof body.resolution !== 'string') {
      await logApiUsage({
        userId,
        apiKeyId,
        endpoint: 'submit',
        status: 'invalid_input',
        errorMessage: 'resolution not string',
      });
      return badRequest("resolution must be '1k', '2k', or '4k'");
    }
    const normalised = body.resolution.trim().toLowerCase();
    if (!ALLOWED_RESOLUTIONS.has(normalised)) {
      await logApiUsage({
        userId,
        apiKeyId,
        endpoint: 'submit',
        status: 'invalid_input',
        errorMessage: `invalid resolution ${normalised}`,
      });
      return badRequest("resolution must be '1k', '2k', or '4k'");
    }
    if (normalised === '4k' && size && !ALLOWED_4K_SIZES.has(size)) {
      await logApiUsage({
        userId,
        apiKeyId,
        endpoint: 'submit',
        status: 'invalid_input',
        errorMessage: `4k not allowed for size ${size}`,
      });
      return badRequest(
        `resolution '4k' is only supported for sizes: ${Array.from(
          ALLOWED_4K_SIZES
        ).join(', ')}`
      );
    }
    resolution = normalised;
  }
  let outputFormat: 'png' | 'jpg' | 'jpeg' | undefined;
  if (body.output_format !== undefined && body.output_format !== null) {
    if (
      body.output_format !== 'png' &&
      body.output_format !== 'jpg' &&
      body.output_format !== 'jpeg'
    ) {
      await logApiUsage({
        userId,
        apiKeyId,
        endpoint: 'submit',
        status: 'invalid_input',
        errorMessage: 'invalid output_format',
      });
      return badRequest("output_format must be 'png', 'jpg', or 'jpeg'");
    }
    outputFormat = body.output_format;
  }

  const modelId = requestedModel;
  const creditsNeeded = n;
  const hasInputImage = !!(referenceImages && referenceImages.length > 0);
  const mode = hasInputImage ? 'image-to-image' : 'text-to-image';

  // 3. Deduct credits atomically
  try {
    await consumeCredits({
      userId,
      amount: creditsNeeded,
      description: `API image generation: ${modelId} (n=${n})`,
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      await logApiUsage({
        userId,
        apiKeyId,
        endpoint: 'submit',
        status: 'insufficient_credits',
        creditsDelta: 0,
        errorMessage: 'insufficient credits',
      });
      return NextResponse.json(
        {
          error: 'INSUFFICIENT_CREDITS',
          message:
            'Your account does not have enough credits for this request.',
          creditsRequired: creditsNeeded,
        },
        { status: 402 }
      );
    }
    console.error('[api/v1/submit] consumeCredits error:', err);
    await logApiUsage({
      userId,
      apiKeyId,
      endpoint: 'submit',
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'credit error',
    });
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to process credits' },
      { status: 500 }
    );
  }

  // 4. Resolve provider, create asset record, submit
  let recordId: string | null = null;
  try {
    // Surface execution rules pick the ExecutableModel from request
    // context. Today the API surface has no rules — callers always
    // get the canonical product implementation — but future rules
    // (region-specific upstreams for compliance, A/B tests) plug in
    // here without touching this route.
    const executionDecision = resolveExecutionForSurface(
      API_SURFACE,
      buildExecutionContext({
        headers: request.headers,
        prompt,
      })
    );
    const {
      provider,
      channel: resolvedChannel,
      upstreamBackend,
      executable,
    } = await getImageProvider(
      modelId,
      hasInputImage,
      undefined,
      executionDecision.executableId
    );

    const metadata = {
      creditDeduction: { amount: creditsNeeded, modelId },
      n,
    };
    // Internal-only: never serialize. upstreamBackend identifies the
    // real upstream model (e.g. 'maxapi-grok') and would defeat the
    // ProductModel ↔ ExecutableModel separation if it leaked.
    // channelDecision snapshots the surface routing call for audit.
    const executionMetadata = {
      upstreamBackend,
      channelDecision: executionDecision.decision,
    };

    const created = await createImageGeneration({
      userId,
      modelId,
      externalModelId: modelId,
      internalModelId: executable.id,
      prompt,
      mode,
      inputImageUrls: referenceImages,
      aspectRatio: size || '1:1',
      resolution,
      outputFormat: outputFormat || 'png',
      status: 'PENDING',
      creditsUsed: creditsNeeded,
      metadata,
      executionMetadata,
      source: 'api',
    });
    recordId = created.id;

    await updateImageGenerationById(recordId, { channel: resolvedChannel });

    const baseUrl =
      process.env.WEBHOOK_BASE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      'http://localhost:3000';
    // Channel-specific webhook. Kie's callback body uses `data.state`
    // ('success'|'fail'), MaxAPI uses `data.status` ('SUCCESS'|'FAILED');
    // routing to the wrong endpoint silently drops the record at
    // PROCESSING and skips the refund path.
    const webhookUrl =
      resolvedChannel === 'kie'
        ? buildWebhookUrl(baseUrl, '/api/ai-callback/nano-banana')
        : buildWebhookUrl(baseUrl, '/api/image-generation/webhook/maxapi');

    const result = await provider.submit(
      executable,
      {
        prompt,
        image_urls: referenceImages,
        size,
        resolution,
        output_format: outputFormat,
        n,
      },
      webhookUrl
    );

    await updateImageGenerationById(recordId, {
      providerTaskId: result.request_id,
      status: 'PROCESSING',
    });

    await logApiUsage({
      userId,
      apiKeyId,
      endpoint: 'submit',
      taskId: recordId,
      status: 'success',
      creditsDelta: creditsNeeded,
    });

    return NextResponse.json(
      {
        task_id: recordId,
        status: 'PROCESSING',
        credits_used: creditsNeeded,
      },
      { status: 200 }
    );
  } catch (providerError) {
    const upstreamMessage =
      providerError instanceof Error
        ? providerError.message
        : 'Image generation failed';
    console.error('[api/v1/submit] provider error:', providerError);

    // Refund since we already deducted
    let refunded = false;
    try {
      refunded = await refundImageCredits(
        userId,
        creditsNeeded,
        modelId,
        recordId ?? 'unknown'
      );
    } catch (refundError) {
      console.error('[api/v1/submit] refund failed:', refundError);
    }

    if (recordId) {
      try {
        await updateImageGenerationById(recordId, {
          status: 'FAILED',
          errorMessage: upstreamMessage,
          metadata: {
            creditDeduction: { amount: creditsNeeded, modelId },
            refunded,
            n,
          },
        });
      } catch (updateError) {
        console.error(
          '[api/v1/submit] update FAILED status failed:',
          updateError
        );
      }
    }

    await logApiUsage({
      userId,
      apiKeyId,
      endpoint: 'submit',
      taskId: recordId,
      status: 'provider_error',
      creditsDelta: refunded ? -creditsNeeded : creditsNeeded,
      errorMessage: upstreamMessage,
    });

    // Sanitize before returning: `upstreamMessage` may contain vendor
    // strings ("MaxAPI error: 403 ...", "Apimart error: ...") that
    // identify the real backend. The raw value stays in DB / logs
    // (`logApiUsage` above keeps it unredacted for ops); the API
    // response gets a generic message + status code only.
    return NextResponse.json(
      {
        error: 'PROVIDER_ERROR',
        message: sanitizeProviderErrorMessage(upstreamMessage),
        refunded,
      },
      { status: 502 }
    );
  }
}
