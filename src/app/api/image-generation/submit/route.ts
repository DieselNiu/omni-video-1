import { websiteConfig } from '@/config/website';
import { consumeCredits, getUserCredits } from '@/credits/credits';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { getImageProvider } from '@/image';
import {
  calculateImageCredits,
  getImageModel,
} from '@/image/config/image-models';
import {
  createImageGeneration,
  updateImageGenerationById,
} from '@/image/data/image-generation';
import { refundImageCredits } from '@/image/utils/credits';
import { sanitizeProviderErrorMessage } from '@/image/utils/sanitize-provider-error';
import { trackServerEvent } from '@/lib/analytics/server';
import { auth } from '@/lib/auth';
import { ENTITLEMENT_SCOPE } from '@/lib/entitlements/constants';
import { hasActiveEntitlement } from '@/lib/entitlements/entitlements';
import {
  FairUseError,
  assertNanoFamilyFairUse,
} from '@/lib/entitlements/fair-use';
import {
  isNanoFamilyModel,
  shouldChargeCreditsForImage,
  shouldUseNanoEntitlement,
} from '@/lib/entitlements/nano-family';
import {
  buildExecutionContext,
  resolveExecutionForSurface,
} from '@/lib/generation/resolve-execution';
import { detectNsfw } from '@/lib/nsfw/detect';
import { isProviderModerationError } from '@/lib/nsfw/provider-error';
import { isPaidUser } from '@/lib/nsfw/user-tier';
import { IMAGE_PRODUCTS } from '@/models/image-models';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      modelId,
      prompt,
      imageUrls,
      aspectRatio,
      resolution,
      outputFormat,
    } = body;

    // Validate required fields
    if (!modelId || !prompt) {
      return NextResponse.json(
        { error: 'modelId and prompt are required' },
        { status: 400 }
      );
    }

    // Get model config
    const modelConfig = getImageModel(modelId);
    if (!modelConfig) {
      return NextResponse.json(
        { error: `Unknown model: ${modelId}` },
        { status: 400 }
      );
    }

    // Surface gate: dashboard / credit-charged contexts only accept
    // ProductModel ids the `user-paid` surface explicitly allows.
    // Defense-in-depth alongside any per-model `requiresAuth` flag.
    const surface = websiteConfig.generation.surfaces['user-paid'];
    if (!surface.allowedModels.includes(modelId)) {
      return NextResponse.json(
        {
          error: 'MODEL_NOT_AVAILABLE_ON_SURFACE',
          message: 'This model is not available in this context.',
        },
        { status: 403 }
      );
    }
    const productModel = IMAGE_PRODUCTS.find((p) => p.id === modelId);
    if (productModel?.policy.requiresAuth && !session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // NSFW detection — block free users, allow paid users
    const nsfwResult = await detectNsfw({ prompt, imageUrls });
    if (nsfwResult.flagged) {
      const paid = await isPaidUser(session.user.id);
      if (!paid) {
        return NextResponse.json(
          {
            error: 'NSFW_BLOCKED',
            message:
              'Your prompt contains content that requires a paid plan. Please upgrade to continue.',
          },
          { status: 403 }
        );
      }
    }

    // Only apply default resolution for Pro models that support it
    const normalizedResolution =
      resolution || (modelConfig.isProApi ? '1K' : undefined);
    const isNanoFamily = isNanoFamilyModel(modelId);
    let hasNanoEntitlement = false;

    if (isNanoFamily) {
      try {
        hasNanoEntitlement = await hasActiveEntitlement(
          session.user.id,
          ENTITLEMENT_SCOPE.NANO_FAMILY
        );
      } catch (error) {
        console.error('Nano entitlement check error:', error);
        hasNanoEntitlement = false;
      }
    }

    // Calculate credits (resolution-aware)
    const creditsNeeded = calculateImageCredits(modelId, normalizedResolution);

    const useNanoEntitlement = shouldUseNanoEntitlement(
      modelId,
      hasNanoEntitlement
    );
    const shouldChargeCredits = shouldChargeCreditsForImage(
      modelId,
      hasNanoEntitlement
    );

    // Apply fair-use only for entitlement path
    if (useNanoEntitlement) {
      try {
        await assertNanoFamilyFairUse(
          session.user.id,
          modelId,
          normalizedResolution
        );
      } catch (error) {
        if (error instanceof FairUseError) {
          trackServerEvent('nano_fair_use_limit_hit', {
            userId: session.user.id,
            modelId,
            resolution: normalizedResolution,
          });
          return NextResponse.json(
            {
              error: error.code,
              message:
                'You have reached the system fair-use threshold for Nano generation today. Please try again later.',
            },
            { status: error.status }
          );
        }
        throw error;
      }
    }

    // Check credits when entitlement is not available
    if (shouldChargeCredits) {
      const userCredits = await getUserCredits(session.user.id);
      if (userCredits < creditsNeeded) {
        return NextResponse.json(
          {
            error: 'Insufficient credits',
            creditsNeeded,
            creditsAvailable: userCredits,
          },
          { status: 402 }
        );
      }
    }

    // Determine mode
    const mode =
      imageUrls && imageUrls.length > 0 ? 'image-to-image' : 'text-to-image';

    // Resolve provider up front so we can stamp the concrete upstream
    // (e.g. 'maxapi-grok' vs 'maxapi-nano-banana') into the asset metadata.
    // `executable.id` is the registry-internal model identifier we write to
    // `internal_model_id`; `modelId` stays the product-facing id for UI / billing.
    const hasInputImage = Array.isArray(imageUrls) && imageUrls.length > 0;
    // Surface execution rules pick the ExecutableModel based on request
    // context (locale / country / prompt). When no rule matches we fall
    // through to the ProductModel's product-level resolver — same end
    // result as before this gate existed.
    const executionDecision = resolveExecutionForSurface(
      surface,
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

    // billingMetadata = public, safe to surface (creditDeduction etc.).
    // executionMetadata = internal, never leaves the server. upstreamBackend
    // identifies the real upstream model family (e.g. 'maxapi-grok'),
    // which would defeat the ProductModel ↔ ExecutableModel separation
    // if it leaked through metadata.
    const billingMetadata = useNanoEntitlement
      ? {
          billingMode: 'entitlement',
          entitlementScope: ENTITLEMENT_SCOPE.NANO_FAMILY,
        }
      : {
          creditDeduction: {
            amount: creditsNeeded,
            modelId,
          },
        };
    const executionMetadata = {
      upstreamBackend,
      // Snapshot of the surface execution-rules decision (matched rule
      // index, country/locale/promptIsChinese inputs, chosen executable).
      // Server-only; stripped from any client-bound serializer.
      channelDecision: executionDecision.decision,
    };

    // Create record — external = product id (user-facing), internal = executable id
    // (what actually ran). Phase 1 rows have external == internal == modelId; from
    // now on, virtual products may have external ≠ internal.
    const { id: recordId } = await createImageGeneration({
      userId: session.user.id,
      modelId,
      externalModelId: modelId,
      internalModelId: executable.id,
      prompt,
      mode,
      inputImageUrls: imageUrls,
      aspectRatio: aspectRatio || '1:1',
      resolution: normalizedResolution,
      outputFormat: outputFormat || 'png',
      status: 'PENDING',
      creditsUsed: useNanoEntitlement ? 0 : creditsNeeded,
      metadata: billingMetadata,
      executionMetadata,
    });

    if (isNanoFamily) {
      trackServerEvent(
        useNanoEntitlement
          ? 'nano_generation_entitlement_used'
          : 'nano_generation_credit_fallback_used',
        {
          userId: session.user.id,
          modelId,
          resolution: normalizedResolution,
          assetId: recordId,
        }
      );
    }

    // Deduct credits only when entitlement is not available
    if (shouldChargeCredits) {
      await consumeCredits({
        userId: session.user.id,
        amount: creditsNeeded,
        description: `Image generation: ${modelId}`,
      });
    }

    // Submit to the provider resolved above
    try {
      // Store the actual channel used in the asset record
      await updateImageGenerationById(recordId, { channel: resolvedChannel });

      const baseUrl =
        process.env.WEBHOOK_BASE_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        'http://localhost:3000';
      const webhookUrl = `${baseUrl}/api/image-generation/webhook/maxapi`;

      const result = await provider.submit(
        executable,
        {
          prompt,
          image_urls: imageUrls,
          aspect_ratio: aspectRatio,
          resolution: normalizedResolution,
          output_format: outputFormat,
        },
        webhookUrl
      );

      await updateImageGenerationById(recordId, {
        providerTaskId: result.request_id,
        status: 'PROCESSING',
      });

      return NextResponse.json({
        success: true,
        id: recordId,
        taskId: result.request_id,
        status: 'PROCESSING',
        creditsUsed: useNanoEntitlement ? 0 : creditsNeeded,
      });
    } catch (providerError) {
      console.error('Image generation provider error:', providerError);

      const upstreamMessage =
        providerError instanceof Error
          ? providerError.message
          : 'Image generation failed';
      const isModeration = isProviderModerationError(upstreamMessage);

      let refunded = false;
      if (useNanoEntitlement) {
        await updateImageGenerationById(recordId, {
          status: 'FAILED',
          errorMessage: upstreamMessage,
          metadata: billingMetadata,
        });
      } else {
        // Refund credits since provider submission failed
        try {
          refunded = await refundImageCredits(
            session.user.id,
            creditsNeeded,
            modelId,
            recordId
          );
          if (refunded) {
            console.log(
              `Credits refunded for failed image generation: ${recordId}`
            );
          }
        } catch (refundError) {
          console.error(
            'Failed to refund credits after provider error:',
            refundError
          );
        }

        await updateImageGenerationById(recordId, {
          status: 'FAILED',
          errorMessage: upstreamMessage,
          metadata: {
            ...billingMetadata,
            refunded,
          },
        });
      }

      // Get remaining credits after refund (or unchanged for entitlement)
      const remainingCredits = await getUserCredits(session.user.id);

      // upstreamMessage is the raw provider error (kept in DB/logs).
      // clientMessage is sanitized to avoid leaking vendor identity
      // (MaxAPI/Apimart/Kie/Grok/...) through the API response.
      const clientMessage = sanitizeProviderErrorMessage(upstreamMessage);

      if (isModeration) {
        return NextResponse.json(
          {
            error: 'NSFW_BLOCKED',
            message: clientMessage,
            id: recordId,
            refunded,
            remainingCredits,
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        {
          error: clientMessage,
          id: recordId,
          refunded,
          remainingCredits,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Image generation submit error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
