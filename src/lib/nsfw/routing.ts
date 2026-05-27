import { getVideoModel } from '@/video/config/video-models';
import { getNsfwFallbackModelId } from './config';
import { detectNsfw } from './detect';
import { mapParamsToFallback } from './param-mapping';
import type { NsfwRoutingDecision } from './types';
import { isPaidUser } from './user-tier';

interface CheckAndRouteInput {
  userId: string;
  modelId: string;
  prompt?: string;
  imageUrls?: string[];
  params?: Record<string, unknown>;
}

function getVideoType(
  modelType: string
): 'textToVideo' | 'imageToVideo' | null {
  if (modelType === 'text-to-video') return 'textToVideo';
  if (modelType === 'image-to-video') return 'imageToVideo';
  return null;
}

export async function checkAndRouteNsfw(
  input: CheckAndRouteInput
): Promise<NsfwRoutingDecision> {
  const modelConfig = getVideoModel(input.modelId);

  // Always run detection — free users must be blocked regardless of the
  // selected model. `supportsNsfw` only changes the *paid-user* behavior
  // (skip the fallback hop) below.
  const detection = await detectNsfw({
    prompt: input.prompt,
    imageUrls: input.imageUrls,
  });

  const logBase = {
    modelId: input.modelId,
    flagged: detection.flagged,
    categories: detection.categories,
    hasPrompt: !!input.prompt,
    imageCount: input.imageUrls?.length ?? 0,
  };

  if (!detection.flagged) {
    console.log('[NSFW]', { ...logBase, action: 'pass' });
    return { action: 'pass', originalModelId: input.modelId };
  }

  const paid = await isPaidUser(input.userId);

  if (!paid) {
    console.log('[NSFW]', { ...logBase, action: 'block', paid: false });
    return { action: 'block', originalModelId: input.modelId };
  }

  // Paid user + NSFW content: if the chosen model can handle NSFW natively,
  // use it directly; otherwise route to the configured fallback.
  if (modelConfig?.supportsNsfw) {
    console.log('[NSFW]', {
      ...logBase,
      action: 'pass',
      reason: 'model-supports-nsfw',
    });
    return { action: 'pass', originalModelId: input.modelId };
  }

  const videoType = getVideoType(modelConfig?.type ?? '');
  const fallbackModelId = videoType ? getNsfwFallbackModelId(videoType) : null;

  if (!fallbackModelId) {
    console.log('[NSFW]', {
      ...logBase,
      action: 'pass',
      reason: 'no-fallback-configured',
      videoType,
    });
    return { action: 'pass', originalModelId: input.modelId };
  }

  const mappedParams = mapParamsToFallback(
    fallbackModelId,
    (input.params ?? {}) as Record<string, unknown>
  );

  console.log('[NSFW]', {
    ...logBase,
    action: 'fallback',
    fallbackModelId,
    videoType,
  });

  return {
    action: 'fallback',
    originalModelId: input.modelId,
    fallbackModelId,
    mappedParams,
  };
}
