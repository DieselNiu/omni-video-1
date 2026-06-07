import {
  createImageGeneration,
  updateImageGenerationById,
} from '@/image/data/image-generation';
import { getActiveHomeGeneration } from '@/image/utils/concurrency';
import {
  classifyProviderSubmitError,
  submitImageGenerationToProvider,
} from '@/image/utils/provider-submit';
import { sanitizeProviderErrorMessage } from '@/image/utils/sanitize-provider-error';
import { isProviderModerationError } from '@/lib/nsfw/provider-error';
import {
  getExecutableById,
  resolve as registryResolve,
} from '@/models/registry';
import {
  HOME_IMAGE_ERROR,
  HOME_IMAGE_GENERATION_KIND,
  HOME_IMAGE_PROVIDER_INITIAL_STATUS,
  HOME_IMAGE_PROVIDER_PENDING_STATUS,
} from './constants';
import {
  createGuestGeneration,
  updateGuestGenerationById,
} from './guest-generation';
import type { ValidatedHomeSubmitPayload } from './validation';

function getOrigin(value: string | undefined | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return 'invalid-url';
  }
}

function summarizeForwardedHeader(value: string | null) {
  if (!value) return null;
  return value
    .split(',')
    .map((part) =>
      part
        .split(';')
        .map((entry) => entry.trim())
        .filter((entry) => !entry.toLowerCase().startsWith('for='))
        .join(';')
    )
    .filter(Boolean)
    .join(',');
}

function buildDelegateLogContext(request: Request, targetUrl: URL) {
  return {
    targetUrl: targetUrl.toString(),
    targetOrigin: targetUrl.origin,
    targetProtocol: targetUrl.protocol,
    requestUrl: request.url,
    requestOrigin: getOrigin(request.url),
    envBaseOrigin: getOrigin(process.env.NEXT_PUBLIC_BASE_URL),
    envWebhookOrigin: getOrigin(process.env.WEBHOOK_BASE_URL),
    headers: {
      host: request.headers.get('host'),
      forwarded: summarizeForwardedHeader(request.headers.get('forwarded')),
      xForwardedHost: request.headers.get('x-forwarded-host'),
      xForwardedProto: request.headers.get('x-forwarded-proto'),
      xForwardedPort: request.headers.get('x-forwarded-port'),
      xForwardedSsl: request.headers.get('x-forwarded-ssl'),
      cfIpCountry: request.headers.get('cf-ipcountry'),
    },
  };
}

function summarizeFetchError(error: unknown) {
  const summary: Record<string, unknown> = {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  };

  const cause =
    error instanceof Error && 'cause' in error
      ? (error as Error & { cause?: unknown }).cause
      : undefined;

  if (cause && typeof cause === 'object') {
    const causeRecord = cause as Record<string, unknown>;
    summary.causeName = causeRecord.name;
    summary.causeCode = causeRecord.code;
    summary.causeReason = causeRecord.reason;
    summary.causeMessage = causeRecord.message;
  }

  return summary;
}

interface BaseFreeSubmitParams {
  request: Request;
  payload: ValidatedHomeSubmitPayload;
  quotaBucketId: string;
  channelOverride?: string | null;
  channelDecision?: Record<string, unknown> | null;
  /** ExecutableModel id chosen by the surface's executionRules engine.
   *  When set, overrides the ProductModel's product-level resolver so
   *  the chosen executable runs end-to-end. */
  executableOverride?: string | null;
}

interface GuestFreeSubmitParams extends BaseFreeSubmitParams {
  subjectType: 'guest';
  guestId: string;
  abuseBindKeySnapshot: string;
}

interface UserFreeSubmitParams extends BaseFreeSubmitParams {
  subjectType: 'user';
  userId: string;
}

export type SubmitHomeFreeGenerationParams =
  | GuestFreeSubmitParams
  | UserFreeSubmitParams;

export type SubmitHomeFreeGenerationResult =
  | {
      ok: true;
      generationKind: 'asset' | 'guest_generation';
      generationId: string;
      providerRequestId: string;
      responseBody: Record<string, unknown>;
      responseCode: number;
    }
  | {
      ok: false;
      safeToRefund: boolean;
      responseCode: number;
      responseBody: Record<string, unknown>;
      generationKind?: 'asset' | 'guest_generation';
      generationId?: string;
      providerRequestId?: string | null;
    };

export async function delegateToFormalImageSubmit(
  request: Request,
  payload: ValidatedHomeSubmitPayload
) {
  // Forward routing-relevant headers so the dashboard route can build
  // the same ExecutionContext the home route saw. Without these, the
  // delegated request would lose country / locale / accept-language and
  // any future executionRules on `user-paid` would misroute paid CN
  // users to the default Apimart instead of an intended override.
  const forwardedHeaders: Record<string, string> = {
    'content-type': 'application/json',
    cookie: request.headers.get('cookie') ?? '',
  };
  for (const h of [
    'accept-language',
    'cf-ipcountry',
    'x-forwarded-for',
    'x-real-ip',
    'user-agent',
  ]) {
    const v = request.headers.get(h);
    if (v) forwardedHeaders[h] = v;
  }

  const targetUrl = new URL('/api/image-generation/submit', request.url);
  const logContext = buildDelegateLogContext(request, targetUrl);
  console.info('[home-image.delegate] start', {
    ...logContext,
    payload: {
      modelId: payload.modelId,
      mode: payload.mode,
      imageCount: payload.imageUrls.length,
      aspectRatio: payload.aspectRatio,
      resolution: payload.resolution ?? null,
      outputFormat: payload.outputFormat,
    },
  });

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: forwardedHeaders,
    body: JSON.stringify({
      modelId: payload.modelId,
      prompt: payload.prompt,
      imageUrls: payload.imageUrls,
      aspectRatio: payload.aspectRatio,
      resolution: payload.resolution,
      outputFormat: payload.outputFormat,
    }),
    cache: 'no-store',
  }).catch((error) => {
    console.error('[home-image.delegate] fetch failed', {
      ...logContext,
      error: summarizeFetchError(error),
    });
    throw error;
  });

  console.info('[home-image.delegate] response', {
    targetUrl: targetUrl.toString(),
    status: response.status,
    ok: response.ok,
    redirected: response.redirected,
    responseUrl: response.url || null,
  });

  const responseBody = (await response.json().catch(() => ({
    error: 'Failed to parse delegated submit response.',
  }))) as Record<string, unknown> | null;

  if (!response.ok) {
    return {
      ok: false as const,
      responseCode: response.status,
      responseBody: responseBody ?? { error: 'Delegated submit failed.' },
    };
  }

  return {
    ok: true as const,
    responseCode: response.status,
    responseBody: {
      success: true,
      id: responseBody?.id ?? null,
      jobId:
        (responseBody?.taskId as string | undefined) ||
        (responseBody?.providerRequestId as string | undefined) ||
        null,
      status: responseBody?.status ?? HOME_IMAGE_PROVIDER_PENDING_STATUS,
      source: HOME_IMAGE_GENERATION_KIND.ASSET,
      creditsUsed: responseBody?.creditsUsed ?? null,
    },
    generationKind: HOME_IMAGE_GENERATION_KIND.ASSET,
    generationId: (responseBody?.id as string | undefined) ?? '',
    providerRequestId:
      (responseBody?.taskId as string | undefined) ||
      (responseBody?.providerRequestId as string | undefined) ||
      null,
  };
}

export async function submitHomeFreeGeneration(
  params: SubmitHomeFreeGenerationParams
): Promise<SubmitHomeFreeGenerationResult> {
  const activeGeneration = await getActiveHomeGeneration({
    subjectType: params.subjectType,
    // Guest concurrency lock keys on quotaBucketId (derived from the
    // stable abuseBindKey) rather than guestId, so rotating the
    // guest cookie cannot bypass the single-active-generation rule.
    subjectId:
      params.subjectType === 'guest' ? params.quotaBucketId : params.userId,
  });

  if (activeGeneration) {
    // Only expose the blocking jobId when the caller owns the lock:
    // for logged-in users any of their own records qualifies; for
    // guests we require the cookie to match the record's guestId.
    // When it doesn't match (cookie rotation OR a different guest in
    // the same abuse bucket — think office NAT), we return a generic
    // concurrency error with no jobId so the UI doesn't poll/cancel
    // work that isn't visible to the caller. The lock still holds
    // until the in-flight job finishes or the stale-generation
    // timeout releases it.
    const callerOwnsActive =
      params.subjectType === 'user' ||
      (activeGeneration.source === 'guest_generation' &&
        activeGeneration.guestId === params.guestId);

    return {
      ok: false,
      safeToRefund: true,
      responseCode: 409,
      responseBody: {
        error: HOME_IMAGE_ERROR.CONCURRENT_LIMIT,
        jobId: callerOwnsActive ? activeGeneration.providerRequestId : null,
        existingGenerationId: callerOwnsActive ? activeGeneration.id : null,
        existingGenerationStatus: callerOwnsActive
          ? activeGeneration.status
          : null,
        source: callerOwnsActive ? activeGeneration.source : null,
      },
    };
  }

  const generationKind: 'asset' | 'guest_generation' =
    params.subjectType === 'guest'
      ? HOME_IMAGE_GENERATION_KIND.GUEST_GENERATION
      : HOME_IMAGE_GENERATION_KIND.ASSET;
  let generationId: string | null = null;

  const submitT0 = performance.now();
  const submitLap = (label: string) =>
    console.log(
      `[home-image.submitHomeFree] ${label}: +${Math.round(performance.now() - submitT0)}ms`
    );

  try {
    submitLap('start');
    // Registry resolve: pair the product-facing id (externalModelId) with the
    // executable-level id (internalModelId). For gptimage2's current home flow
    // these still equal each other, but future virtual products will diverge.
    const hasInputImage = params.payload.imageUrls.length > 0;
    // When the surface picked an executable via executionRules, honour
    // that pick all the way through DB write + provider call. Otherwise
    // fall back to the ProductModel's product-level resolver.
    const executable = params.executableOverride
      ? (() => {
          const exec = getExecutableById(params.executableOverride!);
          if (!exec) {
            throw new Error(
              `[home-submit] surface rule pointed at unknown executable "${params.executableOverride}"`
            );
          }
          return exec;
        })()
      : registryResolve(params.payload.modelId, { hasInputImage }).executable;
    submitLap('registry.resolve');

    // Public metadata (safe to surface) vs executionMetadata (internal,
    // never leaves the server). channelDecision contains routing details
    // (locale-based routing target = maxapi/grok) and would identify the
    // real backend if returned to the client.
    const metadata: Record<string, unknown> = {
      billingMode: 'free_quota',
      quotaBucketId: params.quotaBucketId,
      homeImage: true,
      subjectType: params.subjectType,
    };
    const executionMetadata: Record<string, unknown> | null =
      params.channelDecision
        ? { channelDecision: params.channelDecision }
        : null;

    if (params.subjectType === 'guest') {
      const createdGuestGeneration = await createGuestGeneration({
        guestId: params.guestId,
        quotaBucketId: params.quotaBucketId,
        abuseBindKeySnapshot: params.abuseBindKeySnapshot,
        modelId: params.payload.modelId,
        externalModelId: params.payload.modelId,
        internalModelId: executable.id,
        prompt: params.payload.prompt,
        mode: params.payload.mode,
        inputImageUrls: params.payload.imageUrls,
        aspectRatio: params.payload.aspectRatio,
        resolution: params.payload.resolution,
        outputFormat: params.payload.outputFormat,
        metadata,
        executionMetadata,
      });
      generationId = createdGuestGeneration.id;
      submitLap('createGuestGeneration(DB insert)');
    } else {
      const createdImageGeneration = await createImageGeneration({
        userId: params.userId,
        modelId: params.payload.modelId,
        externalModelId: params.payload.modelId,
        internalModelId: executable.id,
        prompt: params.payload.prompt,
        mode: params.payload.mode,
        inputImageUrls: params.payload.imageUrls,
        aspectRatio: params.payload.aspectRatio,
        resolution: params.payload.resolution,
        outputFormat: params.payload.outputFormat,
        status: HOME_IMAGE_PROVIDER_INITIAL_STATUS,
        creditsUsed: 0,
        metadata,
        executionMetadata,
      });
      generationId = createdImageGeneration.id;
      submitLap('createImageGeneration(DB insert)');
    }

    const providerResult = await submitImageGenerationToProvider({
      modelId: params.payload.modelId,
      channelOverride: params.channelOverride ?? null,
      executableOverride: params.executableOverride ?? null,
      input: {
        prompt: params.payload.prompt,
        image_urls:
          params.payload.imageUrls.length > 0
            ? params.payload.imageUrls
            : undefined,
        aspect_ratio: params.payload.aspectRatio,
        resolution: params.payload.resolution,
        output_format:
          params.payload.outputFormat === 'jpg' ||
          params.payload.outputFormat === 'jpeg'
            ? params.payload.outputFormat
            : 'png',
      },
    });
    submitLap('submitImageGenerationToProvider(HTTP -> apimart)');

    if (params.subjectType === 'guest') {
      await updateGuestGenerationById(generationId, {
        channel: providerResult.channel,
      });
    } else {
      await updateImageGenerationById(generationId, {
        channel: providerResult.channel,
      });
    }

    if (params.subjectType === 'guest') {
      await updateGuestGenerationById(generationId, {
        providerRequestId: providerResult.requestId,
        status: providerResult.status || HOME_IMAGE_PROVIDER_PENDING_STATUS,
      });
    } else {
      await updateImageGenerationById(generationId, {
        providerTaskId: providerResult.requestId,
        status: providerResult.status || HOME_IMAGE_PROVIDER_PENDING_STATUS,
      });
    }

    return {
      ok: true,
      responseCode: 200,
      generationKind,
      generationId,
      providerRequestId: providerResult.requestId,
      responseBody: {
        success: true,
        id: generationId,
        jobId: providerResult.requestId,
        status: providerResult.status || HOME_IMAGE_PROVIDER_PENDING_STATUS,
        source: generationKind,
      },
    };
  } catch (error) {
    const providerError = classifyProviderSubmitError(error);
    const errorMessage =
      providerError.message || 'Homepage image submission failed';
    const submissionUnknown = providerError.kind === 'unknown';

    if (generationId) {
      const failureMetadata = {
        billingMode: 'free_quota',
        quotaBucketId: params.quotaBucketId,
        homeImage: true,
        subjectType: params.subjectType,
        submissionUnknown,
      };

      try {
        if (generationKind === HOME_IMAGE_GENERATION_KIND.GUEST_GENERATION) {
          await updateGuestGenerationById(generationId, {
            status: 'FAILED',
            errorMessage,
            metadata: failureMetadata,
            completedAt: new Date(),
          });
        } else {
          await updateImageGenerationById(generationId, {
            status: 'FAILED',
            errorMessage,
            metadata: failureMetadata,
          });
        }
      } catch (updateError) {
        console.error(
          '[home-image] failed to update generation after submit error:',
          updateError
        );
      }
    }

    // errorMessage is the raw provider error (kept in DB/logs for audit).
    // clientMessage is sanitized to prevent vendor names (MaxAPI / Apimart
    // / Kie / Grok / ...) from leaking through error responses.
    const clientMessage = sanitizeProviderErrorMessage(errorMessage);

    return {
      ok: false,
      safeToRefund: providerError.kind === 'definitive',
      responseCode: isProviderModerationError(errorMessage)
        ? 403
        : (providerError.statusCode ?? 500),
      responseBody: isProviderModerationError(errorMessage)
        ? {
            error: 'NSFW_BLOCKED',
            message: clientMessage,
            id: generationId,
          }
        : submissionUnknown
          ? {
              error: 'SUBMISSION_UNKNOWN',
              message: clientMessage,
              id: generationId,
            }
          : {
              error: clientMessage,
              id: generationId,
            },
      generationKind,
      generationId: generationId ?? undefined,
      providerRequestId: null,
    };
  }
}
