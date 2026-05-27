import { websiteConfig } from '@/config/website';
import { sanitizeProviderErrorMessage } from '@/image/utils/sanitize-provider-error';
import { auth } from '@/lib/auth';
import {
  buildExecutionContext,
  resolveExecutionForSurface,
} from '@/lib/generation/resolve-execution';
import { checkAndRouteNsfw, isProviderModerationError } from '@/lib/nsfw';
import { buildWebhookUrl } from '@/lib/urls/urls';
import { getVideoExecutableById } from '@/models/video-models';
import {
  getVideoModel,
  getVideoModelLabel,
  getVideoProvider,
  resolveBackendModelId,
} from '@/video';
import {
  type CreditDeductionInfo,
  consumeVideoCredits,
  getRemainingCredits,
  hasEnoughCreditsForVideo,
  refundVideoCredits,
} from '@/video/credits';
import {
  createVideoGeneration,
  updateVideoGenerationById,
} from '@/video/data/video-generation';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

// Map channel names to webhook path segments for path-based routing.
function getWebhookChannel(channel: string): string | null {
  const channelToWebhook: Record<string, string> = {
    maxapi: 'maxapi',
    // Future channels can be added here
    // byteplus: 'byteplus',
    // kie: 'kie',
  };
  return channelToWebhook[channel] ?? null;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Parse request body
    const body = await request.json();
    const {
      model,
      prompt,
      image_url,
      image_urls,
      image_roles,
      video_url,
      negative_prompt,
      aspect_ratio = '16:9',
      duration = 8,
      resolution = '1080p',
      generate_audio = false,
      generationType,
      watermarkEnabled = false,
      referenceVideos,
      referenceAudios,
      inputVideoDurationSeconds,
    } = body;

    // Validate required parameters
    if (!model) {
      return NextResponse.json({ error: 'Model is required' }, { status: 400 });
    }

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Surface gate: video.user-paid surface declares the
    // frontend-facing model ids permitted in this context. Anything
    // outside the allow-list is rejected before NSFW / credit checks.
    const videoSurface = websiteConfig.generation.videoSurfaces['user-paid'];
    if (!videoSurface.allowedModels.includes(model)) {
      return NextResponse.json(
        {
          error: 'MODEL_NOT_AVAILABLE_ON_SURFACE',
          message: 'This model is not available in this context.',
        },
        { status: 403 }
      );
    }

    // Resolve frontend model ID to backend model ID.
    // Surface execution rules can override the legacy
    // resolveBackendModelId pick — useful for region-specific routing
    // (e.g. CN customers on a cheaper backend) without changing the
    // wire-level model id seen by the client.
    const hasInputImage = !!(
      image_url ||
      (image_urls && image_urls.length > 0)
    );

    const executionDecision = resolveExecutionForSurface(
      videoSurface,
      buildExecutionContext({
        headers: request.headers,
        prompt,
      })
    );

    let resolvedModelId: string;
    if (executionDecision.executableId) {
      // Surface rule pinned a specific VideoExecutableModel.id; that
      // id IS the backend modelId by registry convention, so we can
      // hand it directly to the existing pipeline.
      const exec = getVideoExecutableById(executionDecision.executableId);
      if (!exec) {
        return NextResponse.json(
          {
            error: 'INTERNAL_ERROR',
            message: 'Surface routing rule pointed at unknown executable.',
          },
          { status: 500 }
        );
      }
      resolvedModelId = exec.id;
    } else {
      try {
        resolvedModelId = resolveBackendModelId(
          model,
          hasInputImage,
          generationType
        );
      } catch {
        return NextResponse.json(
          { error: `Unknown model: ${model}` },
          { status: 400 }
        );
      }
    }

    // Validate model exists
    let modelConfig = getVideoModel(resolvedModelId);
    if (!modelConfig) {
      return NextResponse.json(
        { error: `Unknown model: ${resolvedModelId}` },
        { status: 400 }
      );
    }

    // NSFW detection and routing
    let nsfwFallback = false;
    let fallbackModelName: string | undefined;
    const nsfwRouting = await checkAndRouteNsfw({
      userId,
      modelId: resolvedModelId,
      prompt,
      imageUrls: image_urls,
      params: {
        resolution,
        aspectRatio: aspect_ratio,
        duration,
        generateAudio: generate_audio,
        imageUrls: image_urls,
        imageRoles: image_roles,
      },
    });

    if (nsfwRouting.action === 'block') {
      return NextResponse.json(
        {
          error: 'NSFW_BLOCKED',
          message:
            "The current model can't process your request. Upgrade to unlock more models.",
        },
        { status: 403 }
      );
    }

    if (nsfwRouting.action === 'fallback' && nsfwRouting.fallbackModelId) {
      nsfwFallback = true;
      const fallbackConfig = getVideoModel(nsfwRouting.fallbackModelId);
      fallbackModelName = fallbackConfig?.name ?? nsfwRouting.fallbackModelId;
      resolvedModelId = nsfwRouting.fallbackModelId;
      modelConfig = fallbackConfig ?? modelConfig;
    }

    // Determine audio generation:
    // - If user explicitly passed generate_audio (true/false), respect their choice
    // - Otherwise, default to model's supportsAudio setting
    // Models with audioPremiumCredits (like Seedance 1.5 Pro) let users toggle audio
    // Models without premium (like Veo3) always generate audio if supported
    const shouldGenerateAudio =
      typeof generate_audio === 'boolean'
        ? generate_audio
        : modelConfig.supportsAudio === true;

    // Parse duration
    const durationSeconds =
      typeof duration === 'string' ? Number.parseInt(duration, 10) : duration;

    // Ali wan2.7-r2v and wan2.7-videoedit bill on
    // `input_video_duration + output_video_duration`. The client already
    // measured input video durations off the upload blob and forwarded
    // them as inputVideoDurationSeconds; for these two backends we fold
    // that into the credit basis. All other models ignore it.
    const aliModel = modelConfig.aliModel;
    const billsInputVideoDuration =
      aliModel === 'wan2.7-r2v' || aliModel === 'wan2.7-videoedit';
    const inputVideoSeconds =
      billsInputVideoDuration && typeof inputVideoDurationSeconds === 'number'
        ? Math.max(0, Math.ceil(inputVideoDurationSeconds))
        : 0;
    // wan2.7-videoedit treats duration=0 as "match input length", so the
    // real output equals inputVideoSeconds. Resolve that sentinel before
    // adding input + output for Ali's billing formula.
    const resolvedOutputSeconds =
      billsInputVideoDuration && durationSeconds === 0
        ? inputVideoSeconds
        : durationSeconds;
    const billedDurationSeconds = resolvedOutputSeconds + inputVideoSeconds;
    const hasVideoInput = !!(
      video_url ||
      (Array.isArray(referenceVideos) && referenceVideos.length > 0)
    );
    const hasGeminiOmniVideoInput =
      resolvedModelId === 'gemini-omni-video' && hasVideoInput;

    // Check user credits
    const creditsCheck = await hasEnoughCreditsForVideo(
      userId,
      resolvedModelId,
      billedDurationSeconds,
      shouldGenerateAudio,
      resolution,
      hasGeminiOmniVideoInput
    );

    if (!creditsCheck.hasEnough) {
      return NextResponse.json(
        {
          error: 'Insufficient credits',
          required: creditsCheck.required,
          current: creditsCheck.current,
          ...(nsfwFallback && {
            nsfwFallback: {
              fallbackModelName,
              message: `Your content was routed to ${fallbackModelName} for NSFW handling, which requires ${creditsCheck.required} credits. You have ${creditsCheck.current}.`,
            },
          }),
        },
        { status: 402 }
      );
    }

    // Persist the original frontend-facing model id so the history
    // endpoint can echo it back instead of the resolved backend id
    // (avoids leaking that e.g. wan2-7 routes to wan26-* via DevTools).
    const baseMetadata: Record<string, unknown> = { requestedModelId: model };

    // Create database record first
    const { id } = await createVideoGeneration({
      userId,
      modelId: resolvedModelId,
      prompt,
      inputImageUrl: image_url,
      imageUrls: image_urls,
      negativePrompt: negative_prompt,
      aspectRatio: aspect_ratio,
      durationSeconds,
      hasAudio: shouldGenerateAudio,
      status: 'PENDING',
      metadata: baseMetadata,
    });

    // Deduct credits
    let deductionInfo: CreditDeductionInfo;
    try {
      deductionInfo = await consumeVideoCredits(
        userId,
        resolvedModelId,
        billedDurationSeconds,
        shouldGenerateAudio,
        resolution,
        id,
        // Preserve the user-facing brand (e.g. "Gemini Omni") in credit
        // history even when resolveBackendModelId swapped the backend
        // (e.g. wan26-text-to-video → "Wan 2.6").
        getVideoModelLabel(model),
        hasGeminiOmniVideoInput
      );
    } catch (creditError) {
      // Update record as failed
      await updateVideoGenerationById(id, {
        status: 'FAILED',
        errorMessage: 'Failed to deduct credits',
      });
      throw creditError;
    }

    // Store credit deduction info in metadata for potential refund
    await updateVideoGenerationById(id, {
      metadata: { ...baseMetadata, creditDeduction: deductionInfo },
    });

    // Get provider and submit
    try {
      const { provider, channel } = await getVideoProvider(resolvedModelId);

      // Build webhook URL (use separate WEBHOOK_BASE_URL for ngrok in development)
      // Route to channel-specific webhook path when a mapping exists
      const baseUrl =
        process.env.WEBHOOK_BASE_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        'http://localhost:3000';
      const webhookChannel = getWebhookChannel(channel);
      const webhookUrl = webhookChannel
        ? buildWebhookUrl(
            baseUrl,
            `/api/video-generation/webhook/${webhookChannel}`
          )
        : buildWebhookUrl(baseUrl, '/api/video-generation/webhook');

      // Store the actual channel used in the asset record
      await updateVideoGenerationById(id, {
        channel,
        metadata: { ...baseMetadata, creditDeduction: deductionInfo },
      });

      const input = {
        model: resolvedModelId,
        prompt,
        image_url,
        image_urls,
        image_roles,
        video_url,
        negative_prompt,
        aspect_ratio,
        duration: durationSeconds,
        resolution,
        generate_audio: shouldGenerateAudio,
        generationType: generationType || modelConfig.generationType,
        watermarkEnabled,
        referenceVideos,
        referenceAudios,
      };

      const response = await provider.submit(
        resolvedModelId,
        input,
        webhookUrl
      );

      // Get remaining credits
      const remainingCredits = await getRemainingCredits(userId);

      // Handle synchronous providers (like Flow) that return completed
      // results immediately. r2-or-fallback semantics — return whatever
      // URL the provider gives us so the UI renders immediately.
      if (response.status === 'COMPLETED' && response.raw_response) {
        const rawResponse = response.raw_response as {
          video_url?: string;
          r2_url?: string;
        };

        const videoUrl = rawResponse.r2_url || rawResponse.video_url;

        if (videoUrl) {
          await updateVideoGenerationById(id, {
            status: 'SAVED_TO_R2',
            providerRequestId: response.request_id,
            videoUrl: videoUrl,
            videoUrlR2: rawResponse.r2_url,
          });

          return NextResponse.json({
            id,
            requestId: response.request_id,
            status: 'COMPLETED',
            videoUrl,
            requiredCredits: creditsCheck.required,
            remainingCredits,
            ...(nsfwFallback && {
              nsfwFallback: true,
              fallbackModelName,
              creditsUsed: creditsCheck.required,
            }),
          });
        }
      }

      // Async providers - update database with request ID and wait for callback/polling
      await updateVideoGenerationById(id, {
        status: 'IN_QUEUE',
        providerRequestId: response.request_id,
      });

      return NextResponse.json({
        id,
        requestId: response.request_id,
        status: 'IN_QUEUE',
        requiredCredits: creditsCheck.required,
        remainingCredits,
        ...(nsfwFallback && {
          nsfwFallback: true,
          fallbackModelName,
          creditsUsed: creditsCheck.required,
        }),
      });
    } catch (providerError) {
      // Provider failed, refund credits immediately
      const errorMessage =
        providerError instanceof Error
          ? providerError.message
          : 'Provider submission failed';
      const isModeration = isProviderModerationError(errorMessage);

      // Refund credits since provider submission failed
      let refunded = false;
      try {
        await refundVideoCredits(userId, deductionInfo);
        refunded = true;
        console.log(`Credits refunded for failed provider submission: ${id}`);
      } catch (refundError) {
        console.error(
          'Failed to refund credits after provider error:',
          refundError
        );
      }

      await updateVideoGenerationById(id, {
        status: 'FAILED',
        errorMessage,
        metadata: {
          ...baseMetadata,
          creditDeduction: deductionInfo,
          refunded,
        },
      });

      // Get remaining credits after refund
      const remainingCredits = await getRemainingCredits(userId);

      // errorMessage is the raw provider error (kept in DB/logs for
      // audit). clientMessage is sanitized to prevent vendor names
      // (MaxAPI / Apimart / Kie / Grok / Flow / ...) from leaking.
      const clientMessage = sanitizeProviderErrorMessage(errorMessage);

      // Mirror the image submit endpoint: surface upstream moderation
      // rejections as 403 + NSFW_BLOCKED so the client opens the upgrade
      // dialog instead of toasting a generic failure.
      if (isModeration) {
        return NextResponse.json(
          {
            error: 'NSFW_BLOCKED',
            message: clientMessage,
            id,
            refunded,
            remainingCredits,
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        {
          error: clientMessage,
          id,
          refunded,
          remainingCredits,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Video generation submit error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
