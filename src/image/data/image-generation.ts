import { randomUUID } from 'crypto';
import {
  createAsset,
  getAssetById,
  getAssetByProviderRequestId,
  softDeleteAssetById,
  updateAsset,
} from '@/assets/data/asset';
import type { Asset } from '@/assets/types';

export interface CreateImageGenerationParams {
  userId: string;
  modelId: string;
  /**
   * Optional registry-resolved ids. When omitted, both default to `modelId`
   * (legacy behavior). Submit routes pass these from `registry.resolve()` to
   * disambiguate product identity (user-facing) from executable identity
   * (what actually ran against the provider).
   */
  externalModelId?: string | null;
  internalModelId?: string | null;
  prompt: string;
  mode?: string;
  inputImageUrls?: string[];
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
  status?: string;
  creditsUsed?: number;
  metadata?: Record<string, unknown>;
  /** Internal-only execution details (upstreamBackend, channelDecision,
   *  provider names). Stripped by `toPublicAsset` before serialization. */
  executionMetadata?: Record<string, unknown> | null;
  /** Source of generation: 'web' (dashboard/UI) or 'api' (public /api/v1). */
  source?: string;
}

export interface UpdateImageGenerationParams {
  status?: string;
  channel?: string;
  errorMessage?: string;
  providerTaskId?: string;
  imageUrls?: string[];
  imageUrlsR2?: string[];
  optimizedPrompt?: string;
  metadata?: Record<string, unknown>;
  executionMetadata?: Record<string, unknown> | null;
  creditsUsed?: number;
}

/**
 * Create a new image generation record (now stored in asset table)
 */
export async function createImageGeneration(
  params: CreateImageGenerationParams
) {
  const id = randomUUID();
  const now = new Date();

  await createAsset({
    id,
    userId: params.userId,
    type: 'image',
    status: params.status || 'PENDING',
    prompt: params.prompt,
    modelId: params.modelId,
    externalModelId: params.externalModelId,
    internalModelId: params.internalModelId,
    mode: params.mode || 'text-to-image',
    inputImageUrls: params.inputImageUrls,
    aspectRatio: params.aspectRatio || '1:1',
    resolution: params.resolution || '1K',
    outputFormat: params.outputFormat || 'png',
    creditsUsed: params.creditsUsed,
    metadata: params.metadata,
    executionMetadata: params.executionMetadata ?? null,
    source: params.source,
    createdAt: now,
  });

  return { id };
}

/**
 * Get image generation by ID (now reads from asset table)
 */
export async function getImageGenerationById(
  id: string
): Promise<Asset | null> {
  return getAssetById({ id });
}

/**
 * Get image generation by provider request ID
 */
export async function getImageGenerationByProviderTaskId(
  taskId: string
): Promise<Asset | null> {
  return getAssetByProviderRequestId(taskId);
}

/**
 * Get image generation by task ID (alias for getImageGenerationByProviderTaskId)
 */
export async function getImageGenerationByTaskId(
  taskId: string
): Promise<Asset | null> {
  return getAssetByProviderRequestId(taskId);
}

/**
 * Update image generation by ID
 */
export async function updateImageGenerationById(
  id: string,
  params: UpdateImageGenerationParams
) {
  await updateAsset({
    id,
    status: params.status,
    channel: params.channel,
    errorMessage: params.errorMessage,
    providerRequestId: params.providerTaskId,
    outputImageUrls: params.imageUrls,
    outputImageUrlsR2: params.imageUrlsR2,
    optimizedPrompt: params.optimizedPrompt,
    metadata: params.metadata,
    executionMetadata: params.executionMetadata,
    creditsUsed: params.creditsUsed,
  });
}

/**
 * Update image generation by provider request ID
 */
export async function updateImageGenerationByProviderTaskId(
  taskId: string,
  params: UpdateImageGenerationParams
) {
  const record = await getAssetByProviderRequestId(taskId);
  if (record) {
    await updateAsset({
      id: record.id,
      status: params.status,
      errorMessage: params.errorMessage,
      outputImageUrls: params.imageUrls,
      outputImageUrlsR2: params.imageUrlsR2,
      optimizedPrompt: params.optimizedPrompt,
      metadata: params.metadata,
      executionMetadata: params.executionMetadata,
    });
  }
}

/**
 * Soft delete image generation
 */
export async function softDeleteImageGeneration(id: string, userId: string) {
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
