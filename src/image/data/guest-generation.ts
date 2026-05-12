import { randomUUID } from 'crypto';
import { getDb } from '@/db';
import { guestGeneration } from '@/db/schema';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';

export type GuestGenerationStatus =
  | 'PENDING'
  | 'IN_QUEUE'
  | 'IN_PROGRESS'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'SAVED_TO_R2'
  | 'CANCELLED'
  | 'FAILED';

export interface GuestGenerationRecord {
  id: string;
  guestId: string;
  userId: string | null;
  quotaBucketId: string | null;
  abuseBindKeySnapshot: string | null;
  type: string;
  status: GuestGenerationStatus;
  title: string | null;
  prompt: string | null;
  optimizedPrompt: string | null;
  negativePrompt: string | null;
  modelId: string | null;
  channel: string | null;
  mode: string | null;
  outputFormat: string | null;
  aspectRatio: string | null;
  resolution: string | null;
  inputImageUrls: string[];
  outputImageUrls: string[];
  outputImageUrlsR2: string[] | null;
  thumbnailUrl: string | null;
  providerRequestId: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  logs: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapDbRowToGuestGeneration(
  row: typeof guestGeneration.$inferSelect
): GuestGenerationRecord {
  return {
    id: row.id,
    guestId: row.guestId,
    userId: row.userId,
    quotaBucketId: row.quotaBucketId,
    abuseBindKeySnapshot: row.abuseBindKeySnapshot,
    type: row.type,
    status: row.status as GuestGenerationStatus,
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
    inputImageUrls: row.inputImageUrls ?? [],
    outputImageUrls: row.outputImageUrls ?? [],
    outputImageUrlsR2: row.outputImageUrlsR2,
    thumbnailUrl: row.thumbnailUrl,
    providerRequestId: row.providerRequestId,
    errorMessage: row.errorMessage,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    logs: (row.logs as Record<string, unknown> | null) ?? null,
    metrics: (row.metrics as Record<string, unknown> | null) ?? null,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createGuestGeneration(params: {
  guestId: string;
  quotaBucketId?: string | null;
  abuseBindKeySnapshot?: string | null;
  modelId: string;
  externalModelId?: string | null;
  internalModelId?: string | null;
  prompt: string;
  mode?: string | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  outputFormat?: string | null;
  status?: GuestGenerationStatus;
  inputImageUrls?: string[] | null;
  metadata?: Record<string, unknown> | null;
}) {
  const db = await getDb();
  const id = randomUUID();
  const now = new Date();

  // Registry dual-write: Phase 2 callers pass explicit external/internal from
  // `registry.resolve()`; legacy callers leave them undefined and we mirror
  // modelId into both.
  const modelId = params.modelId;
  const externalModelId =
    params.externalModelId !== undefined ? params.externalModelId : modelId;
  const internalModelId =
    params.internalModelId !== undefined ? params.internalModelId : modelId;

  await db.insert(guestGeneration).values({
    id,
    guestId: params.guestId,
    quotaBucketId: params.quotaBucketId ?? null,
    abuseBindKeySnapshot: params.abuseBindKeySnapshot ?? null,
    type: 'image',
    status: params.status ?? 'PENDING',
    modelId,
    externalModelId,
    internalModelId,
    prompt: params.prompt,
    mode: params.mode ?? 'text-to-image',
    aspectRatio: params.aspectRatio ?? '1:1',
    resolution: params.resolution ?? '1K',
    outputFormat: params.outputFormat ?? 'png',
    inputImageUrls: params.inputImageUrls ?? [],
    outputImageUrls: [],
    metadata: params.metadata ?? null,
    createdAt: now,
    updatedAt: now,
  });

  return { id };
}

export async function updateGuestGenerationById(
  id: string,
  params: {
    userId?: string | null;
    quotaBucketId?: string | null;
    abuseBindKeySnapshot?: string | null;
    status?: GuestGenerationStatus;
    channel?: string | null;
    providerRequestId?: string | null;
    outputImageUrls?: string[] | null;
    outputImageUrlsR2?: string[] | null;
    thumbnailUrl?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown> | null;
    logs?: Record<string, unknown> | null;
    metrics?: Record<string, unknown> | null;
    completedAt?: Date | null;
  }
) {
  const db = await getDb();
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (params.userId !== undefined) updateData.userId = params.userId;
  if (params.quotaBucketId !== undefined) {
    updateData.quotaBucketId = params.quotaBucketId;
  }
  if (params.abuseBindKeySnapshot !== undefined) {
    updateData.abuseBindKeySnapshot = params.abuseBindKeySnapshot;
  }
  if (params.status !== undefined) updateData.status = params.status;
  if (params.channel !== undefined) updateData.channel = params.channel;
  if (params.providerRequestId !== undefined) {
    updateData.providerRequestId = params.providerRequestId;
  }
  if (params.outputImageUrls !== undefined) {
    updateData.outputImageUrls = params.outputImageUrls;
  }
  if (params.outputImageUrlsR2 !== undefined) {
    updateData.outputImageUrlsR2 = params.outputImageUrlsR2;
  }
  if (params.thumbnailUrl !== undefined) {
    updateData.thumbnailUrl = params.thumbnailUrl;
  }
  if (params.errorMessage !== undefined) {
    updateData.errorMessage = params.errorMessage;
  }
  if (params.metadata !== undefined) updateData.metadata = params.metadata;
  if (params.logs !== undefined) updateData.logs = params.logs;
  if (params.metrics !== undefined) updateData.metrics = params.metrics;
  if (params.completedAt !== undefined) {
    updateData.completedAt = params.completedAt;
  }

  await db
    .update(guestGeneration)
    .set(updateData)
    .where(eq(guestGeneration.id, id));
}

export async function getGuestGenerationByProviderRequestId(
  providerRequestId: string
): Promise<GuestGenerationRecord | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(guestGeneration)
    .where(eq(guestGeneration.providerRequestId, providerRequestId))
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  return mapDbRowToGuestGeneration(rows[0]);
}

export async function getGuestGenerationById(
  id: string
): Promise<GuestGenerationRecord | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(guestGeneration)
    .where(eq(guestGeneration.id, id))
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  return mapDbRowToGuestGeneration(rows[0]);
}

export async function getGuestGenerationByProviderRequestIdForGuest(params: {
  providerRequestId: string;
  guestId: string;
}): Promise<GuestGenerationRecord | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(guestGeneration)
    .where(
      and(
        eq(guestGeneration.providerRequestId, params.providerRequestId),
        eq(guestGeneration.guestId, params.guestId),
        isNull(guestGeneration.userId)
      )
    )
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  return mapDbRowToGuestGeneration(rows[0]);
}

export async function getGuestGenerationByProviderRequestIdForUser(params: {
  providerRequestId: string;
  userId: string;
}): Promise<GuestGenerationRecord | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(guestGeneration)
    .where(
      and(
        eq(guestGeneration.providerRequestId, params.providerRequestId),
        eq(guestGeneration.userId, params.userId)
      )
    )
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  return mapDbRowToGuestGeneration(rows[0]);
}

export async function getLatestGuestGenerationByGuestId(guestId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(guestGeneration)
    .where(eq(guestGeneration.guestId, guestId))
    .orderBy(desc(guestGeneration.createdAt))
    .limit(1);

  return rows[0] ? mapDbRowToGuestGeneration(rows[0]) : null;
}

export async function getRecentGuestGenerationsByGuestId(guestId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(guestGeneration)
    .where(
      and(eq(guestGeneration.guestId, guestId), isNull(guestGeneration.userId))
    )
    .orderBy(desc(guestGeneration.createdAt))
    .limit(5);

  return rows.map(mapDbRowToGuestGeneration);
}

export async function getRecentGuestGenerationsByUserId(userId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(guestGeneration)
    .where(eq(guestGeneration.userId, userId))
    .orderBy(desc(guestGeneration.createdAt))
    .limit(5);

  return rows.map(mapDbRowToGuestGeneration);
}

export async function getActiveGuestGenerationByGuestId(guestId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(guestGeneration)
    .where(
      and(
        eq(guestGeneration.guestId, guestId),
        isNull(guestGeneration.userId),
        or(
          eq(guestGeneration.status, 'PENDING'),
          eq(guestGeneration.status, 'IN_QUEUE'),
          eq(guestGeneration.status, 'IN_PROGRESS'),
          eq(guestGeneration.status, 'PROCESSING')
        )
      )
    )
    .orderBy(desc(guestGeneration.createdAt))
    .limit(1);

  return rows[0] ? mapDbRowToGuestGeneration(rows[0]) : null;
}

export async function claimGuestGenerations(guestId: string, userId: string) {
  const db = await getDb();
  const updated = await db
    .update(guestGeneration)
    .set({
      userId,
      updatedAt: new Date(),
    })
    .where(
      and(eq(guestGeneration.guestId, guestId), isNull(guestGeneration.userId))
    )
    .returning({ id: guestGeneration.id });

  return updated.length;
}

export async function deleteExpiredUnclaimedGuestGenerations(days: number) {
  const db = await getDb();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  await db
    .delete(guestGeneration)
    .where(
      and(
        isNull(guestGeneration.userId),
        sql`${guestGeneration.createdAt} < ${cutoff}`
      )
    );
}
