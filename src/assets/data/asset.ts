import { getDb } from '@/db';
import { asset } from '@/db/schema';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Asset, AssetSort, AssetType } from '../types';

function mapDbRowToAsset(row: typeof asset.$inferSelect): Asset {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as AssetType,
    status: row.status as Asset['status'],
    title: row.title,
    prompt: row.prompt,
    optimizedPrompt: row.optimizedPrompt,
    negativePrompt: row.negativePrompt,
    modelId: row.modelId,
    channel: row.channel,
    mode: row.mode,
    outputFormat: row.outputFormat,
    aspectRatio: row.aspectRatio,
    resolution: row.resolution,
    durationSeconds: row.durationSeconds,
    hasAudio: row.hasAudio,
    effectId: row.effectId,
    inputImageUrls: row.inputImageUrls,
    inputImageRoles: row.inputImageRoles,
    outputImageUrls: row.outputImageUrls,
    outputImageUrlsR2: row.outputImageUrlsR2,
    outputVideoUrl: row.outputVideoUrl,
    outputVideoUrlR2: row.outputVideoUrlR2,
    thumbnailUrl: row.thumbnailUrl,
    providerRequestId: row.providerRequestId,
    errorMessage: row.errorMessage,
    metadata: row.metadata as Record<string, unknown> | null,
    executionMetadata: row.executionMetadata as Record<string, unknown> | null,
    logs: row.logs as Record<string, unknown> | null,
    metrics: row.metrics as Record<string, unknown> | null,
    creditsUsed: row.creditsUsed,
    isFavorite: row.isFavorite,
    isDelete: row.isDelete,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function buildAssetWhereClause(params: {
  userId: string;
  type: 'all' | AssetType;
}) {
  const conditions = [
    eq(asset.userId, params.userId),
    or(isNull(asset.isDelete), eq(asset.isDelete, false)),
  ];

  if (params.type !== 'all') {
    conditions.push(eq(asset.type, params.type));
  }

  return and(...conditions);
}

export async function createAsset(params: {
  id: string;
  userId: string;
  type: AssetType;
  status: string;
  prompt?: string | null;
  optimizedPrompt?: string | null;
  negativePrompt?: string | null;
  modelId?: string | null;
  /**
   * Phase 2 registry cutover: when set, overrides the default `= modelId`
   * assignment for the new dual-write columns. Submit routes pass these from
   * `registry.resolve()` so that virtual/alias products (ProductModel id ≠
   * ExecutableModel id) land with the correct pair on disk.
   */
  externalModelId?: string | null;
  internalModelId?: string | null;
  mode?: string | null;
  outputFormat?: string | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  durationSeconds?: number | null;
  hasAudio?: boolean | null;
  effectId?: string | null;
  inputImageUrls?: string[] | null;
  inputImageRoles?: string[] | null;
  outputImageUrls?: string[] | null;
  outputImageUrlsR2?: string[] | null;
  outputVideoUrl?: string | null;
  outputVideoUrlR2?: string | null;
  thumbnailUrl?: string | null;
  providerRequestId?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Internal-only execution details (upstreamBackend, channelDecision,
   *  provider names). Stripped by `toPublicAsset` before serialization. */
  executionMetadata?: Record<string, unknown> | null;
  creditsUsed?: number | null;
  source?: string | null;
  createdAt?: Date;
}) {
  const db = await getDb();
  const now = new Date();

  // Registry dual-write: callers from Phase 2 routes pass explicit external
  // and internal ids from `registry.resolve()`; legacy callers leave them
  // undefined and we mirror modelId into both.
  const modelId = params.modelId ?? null;
  const externalModelId =
    params.externalModelId !== undefined ? params.externalModelId : modelId;
  const internalModelId =
    params.internalModelId !== undefined ? params.internalModelId : modelId;

  await db.insert(asset).values({
    id: params.id,
    userId: params.userId,
    type: params.type,
    status: params.status,
    prompt: params.prompt ?? null,
    optimizedPrompt: params.optimizedPrompt ?? null,
    negativePrompt: params.negativePrompt ?? null,
    modelId,
    externalModelId,
    internalModelId,
    mode: params.mode ?? null,
    outputFormat: params.outputFormat ?? null,
    aspectRatio: params.aspectRatio ?? null,
    resolution: params.resolution ?? null,
    durationSeconds: params.durationSeconds ?? null,
    hasAudio: params.hasAudio ?? null,
    effectId: params.effectId ?? null,
    inputImageUrls: params.inputImageUrls ?? null,
    inputImageRoles: params.inputImageRoles ?? null,
    outputImageUrls: params.outputImageUrls ?? null,
    outputImageUrlsR2: params.outputImageUrlsR2 ?? null,
    outputVideoUrl: params.outputVideoUrl ?? null,
    outputVideoUrlR2: params.outputVideoUrlR2 ?? null,
    thumbnailUrl: params.thumbnailUrl ?? null,
    providerRequestId: params.providerRequestId ?? null,
    metadata: params.metadata ?? null,
    executionMetadata: params.executionMetadata ?? null,
    creditsUsed: params.creditsUsed ?? null,
    source: params.source ?? null,
    isFavorite: false,
    createdAt: params.createdAt ?? now,
    updatedAt: now,
  });
}

export async function updateAsset(params: {
  id: string;
  status?: string;
  channel?: string | null;
  optimizedPrompt?: string | null;
  outputImageUrls?: string[] | null;
  outputImageUrlsR2?: string[] | null;
  outputVideoUrl?: string | null;
  outputVideoUrlR2?: string | null;
  thumbnailUrl?: string | null;
  providerRequestId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  executionMetadata?: Record<string, unknown> | null;
  logs?: Record<string, unknown> | null;
  metrics?: Record<string, unknown> | null;
  creditsUsed?: number | null;
}) {
  const db = await getDb();
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (params.status !== undefined) updateData.status = params.status;
  if (params.channel !== undefined) updateData.channel = params.channel;
  if (params.optimizedPrompt !== undefined)
    updateData.optimizedPrompt = params.optimizedPrompt;
  if (params.outputImageUrls !== undefined)
    updateData.outputImageUrls = params.outputImageUrls;
  if (params.outputImageUrlsR2 !== undefined)
    updateData.outputImageUrlsR2 = params.outputImageUrlsR2;
  if (params.outputVideoUrl !== undefined)
    updateData.outputVideoUrl = params.outputVideoUrl;
  if (params.outputVideoUrlR2 !== undefined)
    updateData.outputVideoUrlR2 = params.outputVideoUrlR2;
  if (params.thumbnailUrl !== undefined)
    updateData.thumbnailUrl = params.thumbnailUrl;
  if (params.providerRequestId !== undefined)
    updateData.providerRequestId = params.providerRequestId;
  if (params.errorMessage !== undefined)
    updateData.errorMessage = params.errorMessage;
  if (params.metadata !== undefined) updateData.metadata = params.metadata;
  if (params.executionMetadata !== undefined)
    updateData.executionMetadata = params.executionMetadata;
  if (params.logs !== undefined) updateData.logs = params.logs;
  if (params.metrics !== undefined) updateData.metrics = params.metrics;
  if (params.creditsUsed !== undefined)
    updateData.creditsUsed = params.creditsUsed;

  await db.update(asset).set(updateData).where(eq(asset.id, params.id));
}

export async function getAssetById(params: {
  id: string;
  userId?: string;
}): Promise<Asset | null> {
  const db = await getDb();
  const conditions = [
    eq(asset.id, params.id),
    or(isNull(asset.isDelete), eq(asset.isDelete, false)),
  ];

  if (params.userId) {
    conditions.push(eq(asset.userId, params.userId));
  }

  const result = await db
    .select()
    .from(asset)
    .where(and(...conditions))
    .limit(1);

  if (!result[0]) return null;
  return mapDbRowToAsset(result[0]);
}

export async function getAssetByProviderRequestId(
  providerRequestId: string
): Promise<Asset | null> {
  const db = await getDb();
  const result = await db
    .select()
    .from(asset)
    .where(
      and(
        eq(asset.providerRequestId, providerRequestId),
        or(isNull(asset.isDelete), eq(asset.isDelete, false))
      )
    )
    .limit(1);

  if (!result[0]) return null;
  return mapDbRowToAsset(result[0]);
}

const SUCCESS_STATUSES = ['SAVED_TO_R2', 'COMPLETED'];

export async function getUserAssets(params: {
  userId: string;
  type: 'all' | AssetType;
  favorites: boolean;
  sort: AssetSort;
  limit: number;
  offset: number;
}): Promise<Asset[]> {
  const db = await getDb();
  const orderBy =
    params.sort === 'latest' ? desc(asset.createdAt) : asc(asset.createdAt);

  const conditions = [
    eq(asset.userId, params.userId),
    or(isNull(asset.isDelete), eq(asset.isDelete, false)),
    inArray(asset.status, SUCCESS_STATUSES),
  ];

  if (params.type !== 'all') {
    conditions.push(eq(asset.type, params.type));
  }

  if (params.favorites) {
    conditions.push(eq(asset.isFavorite, true));
  }

  const result = await db
    .select()
    .from(asset)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(params.limit)
    .offset(params.offset);

  return result.map((row) => mapDbRowToAsset(row));
}

export async function countUserAssets(params: {
  userId: string;
  type: 'all' | AssetType;
  favorites: boolean;
}): Promise<number> {
  const db = await getDb();

  const conditions = [
    eq(asset.userId, params.userId),
    or(isNull(asset.isDelete), eq(asset.isDelete, false)),
    inArray(asset.status, SUCCESS_STATUSES),
  ];

  if (params.type !== 'all') {
    conditions.push(eq(asset.type, params.type));
  }

  if (params.favorites) {
    conditions.push(eq(asset.isFavorite, true));
  }

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(asset)
    .where(and(...conditions));

  return Number(result[0]?.count ?? 0);
}

export async function toggleAssetFavorite(
  userId: string,
  assetId: string
): Promise<{ favorited: boolean }> {
  const db = await getDb();

  const existing = await db
    .select({ id: asset.id, isFavorite: asset.isFavorite })
    .from(asset)
    .where(and(eq(asset.id, assetId), eq(asset.userId, userId)))
    .limit(1);

  if (!existing[0]) {
    throw new Error('Asset not found');
  }

  const newFavoriteStatus = !existing[0].isFavorite;

  await db
    .update(asset)
    .set({ isFavorite: newFavoriteStatus, updatedAt: new Date() })
    .where(and(eq(asset.id, assetId), eq(asset.userId, userId)));

  return { favorited: newFavoriteStatus };
}

export async function softDeleteAssetById(params: {
  id: string;
  userId: string;
}) {
  const db = await getDb();
  await db
    .update(asset)
    .set({ isDelete: true, updatedAt: new Date() })
    .where(and(eq(asset.id, params.id), eq(asset.userId, params.userId)));
}

export async function assetExistsForUser(params: {
  assetId: string;
  userId: string;
}): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .select({ id: asset.id })
    .from(asset)
    .where(and(eq(asset.id, params.assetId), eq(asset.userId, params.userId)))
    .limit(1);

  return result.length > 0;
}
