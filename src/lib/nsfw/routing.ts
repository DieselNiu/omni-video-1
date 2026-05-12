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

  if (modelConfig?.supportsNsfw) {
    return { action: 'pass', originalModelId: input.modelId };
  }

  const detection = await detectNsfw({
    prompt: input.prompt,
    imageUrls: input.imageUrls,
  });

  if (!detection.flagged) {
    return { action: 'pass', originalModelId: input.modelId };
  }

  const paid = await isPaidUser(input.userId);

  if (!paid) {
    return { action: 'block', originalModelId: input.modelId };
  }

  const videoType = getVideoType(modelConfig?.type ?? '');
  const fallbackModelId = videoType ? getNsfwFallbackModelId(videoType) : null;

  if (!fallbackModelId) {
    return { action: 'pass', originalModelId: input.modelId };
  }

  const mappedParams = mapParamsToFallback(
    fallbackModelId,
    (input.params ?? {}) as Record<string, unknown>
  );

  return {
    action: 'fallback',
    originalModelId: input.modelId,
    fallbackModelId,
    mappedParams,
  };
}
