import { getDb } from '@/db';
import { guestGeneration } from '@/db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';

// Guest reads are scoped to the signed guest_id cookie only. An
// earlier iteration widened this to match on abuseBindKeySnapshot
// as well, which fixed the self-lockout after cookie rotation but
// unintentionally authorized cross-visibility for any two guests
// sharing an abuse tuple (common on NAT / office WiFi / coffee
// shops). If a user loses cookie continuity, the stale-generation
// timeout releases any lock they're stuck behind within minutes;
// history is not cross-session recoverable for guests — logging in
// is the path to durable history. See the CONCURRENT_LIMIT branch
// in submit.ts for the narrow cookie-rotation accommodation.

export type GuestGenerationRecord = typeof guestGeneration.$inferSelect;

export interface CreateGuestGenerationParams {
  guestId: string;
  quotaBucketId: string;
  abuseBindKeySnapshot: string;
  modelId: string;
  /**
   * Optional registry-resolved ids. When omitted, both default to `modelId`.
   * See src/app/api/home/image/_lib/submit.ts for the usage pattern.
   */
  externalModelId?: string | null;
  internalModelId?: string | null;
  prompt: string;
  mode: 'text-to-image' | 'image-to-image';
  inputImageUrls?: string[];
  aspectRatio: string;
  resolution?: string;
  outputFormat: string;
  metadata?: Record<string, unknown> | null;
  /** Internal-only execution details (channelDecision, upstreamBackend,
   *  provider names). Stripped from any client-bound serializer. */
  executionMetadata?: Record<string, unknown> | null;
}

export interface UpdateGuestGenerationParams {
  userId?: string | null;
  status?: string;
  channel?: string | null;
  providerRequestId?: string | null;
  outputImageUrls?: string[] | null;
  outputImageUrlsR2?: string[] | null;
  thumbnailUrl?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  executionMetadata?: Record<string, unknown> | null;
  logs?: Record<string, unknown> | null;
  metrics?: Record<string, unknown> | null;
  completedAt?: Date | null;
}

export async function createGuestGeneration(
  params: CreateGuestGenerationParams
) {
  const db = await getDb();
  const now = new Date();
  const id = crypto.randomUUID();

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
    quotaBucketId: params.quotaBucketId,
    abuseBindKeySnapshot: params.abuseBindKeySnapshot,
    type: 'image',
    status: 'PENDING',
    modelId,
    externalModelId,
    internalModelId,
    prompt: params.prompt,
    mode: params.mode,
    outputFormat: params.outputFormat,
    aspectRatio: params.aspectRatio,
    resolution: params.resolution ?? null,
    inputImageUrls: params.inputImageUrls ?? [],
    outputImageUrls: [],
    metadata: params.metadata ?? null,
    executionMetadata: params.executionMetadata ?? null,
    createdAt: now,
    updatedAt: now,
  });

  return { id };
}

export async function updateGuestGenerationById(
  id: string,
  params: UpdateGuestGenerationParams
) {
  const db = await getDb();
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (params.userId !== undefined) updateData.userId = params.userId;
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
  if (params.executionMetadata !== undefined) {
    updateData.executionMetadata = params.executionMetadata;
  }
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

export async function getGuestGenerationByJobIdForGuest(
  providerRequestId: string,
  guestId: string
) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(guestGeneration)
    .where(
      and(
        eq(guestGeneration.providerRequestId, providerRequestId),
        eq(guestGeneration.guestId, guestId),
        isNull(guestGeneration.userId)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getGuestGenerationByJobIdForUser(
  providerRequestId: string,
  userId: string
) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(guestGeneration)
    .where(
      and(
        eq(guestGeneration.providerRequestId, providerRequestId),
        eq(guestGeneration.userId, userId)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getGuestRecentByGuestId(guestId: string, limit = 20) {
  const db = await getDb();
  return db
    .select()
    .from(guestGeneration)
    .where(
      and(eq(guestGeneration.guestId, guestId), isNull(guestGeneration.userId))
    )
    .orderBy(desc(guestGeneration.createdAt))
    .limit(limit);
}

export async function getGuestRecentByUserId(userId: string, limit = 20) {
  const db = await getDb();
  return db
    .select()
    .from(guestGeneration)
    .where(eq(guestGeneration.userId, userId))
    .orderBy(desc(guestGeneration.createdAt))
    .limit(limit);
}
