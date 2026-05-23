import { randomUUID } from 'crypto';
import {
  createAsset,
  getAssetById,
  getAssetByProviderRequestId,
  softDeleteAssetById,
  updateAsset,
} from '@/assets/data/asset';
import type { Asset } from '@/assets/types';

export interface CreateVideoGenerationParams {
  userId: string;
  modelId: string;
  prompt: string;
  inputImageUrl?: string;
  imageUrls?: string[];
  imageRoles?: string[];
  negativePrompt?: string;
  aspectRatio?: string;
  durationSeconds?: number;
  resolution?: string;
  hasAudio?: boolean;
  status?: string;
  effectId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateVideoGenerationParams {
  status?: string;
  channel?: string;
  errorMessage?: string;
  providerRequestId?: string;
  effectId?: string;
  videoUrl?: string;
  videoUrlR2?: string;
  thumbnailUrl?: string;
  logs?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  optimizedPrompt?: string;
  metadata?: Record<string, unknown>;
  creditsUsed?: number;
}

/**
 * Create a new video generation record (now stored in asset table)
 */
export async function createVideoGeneration(
  params: CreateVideoGenerationParams
) {
  const id = randomUUID();
  const now = new Date();

  // Combine inputImageUrl with imageUrls if provided
  let inputImageUrls = params.imageUrls ?? [];
  if (params.inputImageUrl && !inputImageUrls.includes(params.inputImageUrl)) {
    inputImageUrls = [params.inputImageUrl, ...inputImageUrls];
  }

  await createAsset({
    id,
    userId: params.userId,
    type: 'video',
    status: params.status || 'PENDING',
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    modelId: params.modelId,
    mode:
      params.inputImageUrl || (params.imageUrls?.length ?? 0) > 0
        ? 'image-to-video'
        : 'text-to-video',
    aspectRatio: params.aspectRatio || '16:9',
    resolution: params.resolution || '1080p',
    durationSeconds: params.durationSeconds || 8,
    hasAudio: params.hasAudio || false,
    effectId: params.effectId,
    inputImageUrls: inputImageUrls.length > 0 ? inputImageUrls : null,
    inputImageRoles: params.imageRoles,
    metadata: params.metadata,
    createdAt: now,
  });

  return { id };
}

/**
 * Get video generation by ID (now reads from asset table)
 */
export async function getVideoGenerationById(
  id: string
): Promise<Asset | null> {
  return getAssetById({ id });
}

/**
 * Get video generation by provider request ID (unified lookup)
 */
export async function getVideoGenerationByProviderRequestId(
  requestId: string
): Promise<Asset | null> {
  return getAssetByProviderRequestId(requestId);
}

// Legacy aliases for backward compatibility (all use the same unified lookup)
export const getVideoGenerationByKieVeo3RequestId =
  getVideoGenerationByProviderRequestId;
export const getVideoGenerationByKieSoraRequestId =
  getVideoGenerationByProviderRequestId;
export const getVideoGenerationByVolcanoRequestId =
  getVideoGenerationByProviderRequestId;
export const getVideoGenerationByByteplusRequestId =
  getVideoGenerationByProviderRequestId;
export const getVideoGenerationByApicoreRequestId =
  getVideoGenerationByProviderRequestId;
export const getVideoGenerationByFalRequestId =
  getVideoGenerationByProviderRequestId;
export const getVideoGenerationByAliRequestId =
  getVideoGenerationByProviderRequestId;
export const getVideoGenerationByPixverseRequestId =
  getVideoGenerationByProviderRequestId;

/**
 * Update video generation by ID
 */
export async function updateVideoGenerationById(
  id: string,
  params: UpdateVideoGenerationParams
) {
  await updateAsset({
    id,
    status: params.status,
    channel: params.channel,
    errorMessage: params.errorMessage,
    providerRequestId: params.providerRequestId,
    outputVideoUrl: params.videoUrl,
    outputVideoUrlR2: params.videoUrlR2,
    thumbnailUrl: params.thumbnailUrl,
    optimizedPrompt: params.optimizedPrompt,
    logs: params.logs,
    metrics: params.metrics,
    metadata: params.metadata,
    creditsUsed: params.creditsUsed,
  });
}

/**
 * Update video generation by provider request ID (unified)
 */
export async function updateVideoGenerationByProviderRequestId(
  requestId: string,
  params: UpdateVideoGenerationParams
) {
  const record = await getAssetByProviderRequestId(requestId);
  if (record) {
    await updateAsset({
      id: record.id,
      status: params.status,
      channel: params.channel,
      errorMessage: params.errorMessage,
      outputVideoUrl: params.videoUrl,
      outputVideoUrlR2: params.videoUrlR2,
      thumbnailUrl: params.thumbnailUrl,
      optimizedPrompt: params.optimizedPrompt,
      logs: params.logs,
      metrics: params.metrics,
      metadata: params.metadata,
    });
  }
}

// Legacy aliases for backward compatibility
export const updateVideoGenerationByKieVeo3RequestId =
  updateVideoGenerationByProviderRequestId;
export const updateVideoGenerationByKieSoraRequestId =
  updateVideoGenerationByProviderRequestId;

/**
 * Soft delete video generation
 */
export async function softDeleteVideoGeneration(id: string, userId: string) {
  await softDeleteAssetById({ id, userId });
}

/**
 * Parse metadata - now accepts jsonb directly or string
 */
export function parseMetadata(
  metadata: Record<string, unknown> | string | null
): Record<string, unknown> | null {
  if (!metadata) return null;
  if (typeof metadata === 'object') return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return null;
  }
}

/**
 * Parse logs - now accepts jsonb directly or string
 */
export function parseLogs(
  logs: Record<string, unknown> | string | null
): Record<string, unknown> | null {
  if (!logs) return null;
  if (typeof logs === 'object') return logs;
  try {
    return JSON.parse(logs);
  } catch {
    return null;
  }
}
