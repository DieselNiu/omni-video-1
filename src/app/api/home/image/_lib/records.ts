import { getDb } from '@/db';
import { asset } from '@/db/schema';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import {
  type GuestGenerationRecord,
  getGuestGenerationByJobIdForGuest,
  getGuestGenerationByJobIdForUser,
  getGuestRecentByGuestId,
  getGuestRecentByUserId,
} from './guest-generation';

type AssetRecord = typeof asset.$inferSelect;

/**
 * The shape returned to callers of {@link getHomeImageStatusRecord} and
 * the recent helpers. Public fields are safe to spread into client
 * responses; internal fields (channel, metadata, raw upstream URLs) are
 * nested under `_internal` so they never leak by accident — every
 * consumer that wants them has to reach into that namespace explicitly.
 *
 * - `imageUrlsR2` is the only image URL surface that's safe to expose.
 *   Upstream URLs (provider CDN domains like cdn.maxapi.io) live in
 *   `_internal.upstreamImageUrls` — those identify the real backend.
 * - `metadata` may carry pre-migration legacy fields like
 *   `upstreamBackend` / `channelDecision` that pre-date the
 *   executionMetadata column split.
 * - `channel` is the routing target (maxapi/kie/apimart) used by the
 *   resolver to pick a provider; never publish.
 */
export interface HomeImageRecord {
  id: string;
  source: 'asset' | 'guest_generation';
  status: string;
  modelId: string | null;
  prompt: string | null;
  providerRequestId: string | null;
  imageUrlsR2: string[];
  thumbnailUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  _internal: {
    channel: string | null;
    metadata: Record<string, unknown> | null;
    executionMetadata: Record<string, unknown> | null;
    upstreamImageUrls: string[];
  };
}

function mapAssetRecord(record: AssetRecord): HomeImageRecord {
  return {
    id: record.id,
    source: 'asset',
    status: record.status,
    modelId: record.modelId,
    prompt: record.prompt,
    providerRequestId: record.providerRequestId,
    imageUrlsR2: record.outputImageUrlsR2 ?? [],
    thumbnailUrl: record.thumbnailUrl,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    _internal: {
      channel: record.channel,
      metadata: (record.metadata as Record<string, unknown> | null) ?? null,
      executionMetadata:
        (record.executionMetadata as Record<string, unknown> | null) ?? null,
      upstreamImageUrls: record.outputImageUrls ?? [],
    },
  };
}

function mapGuestRecord(record: GuestGenerationRecord): HomeImageRecord {
  return {
    id: record.id,
    source: 'guest_generation',
    status: record.status,
    modelId: record.modelId,
    prompt: record.prompt,
    providerRequestId: record.providerRequestId,
    imageUrlsR2: record.outputImageUrlsR2 ?? [],
    thumbnailUrl: record.thumbnailUrl,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    _internal: {
      channel: record.channel ?? null,
      metadata: (record.metadata as Record<string, unknown> | null) ?? null,
      executionMetadata:
        (record.executionMetadata as Record<string, unknown> | null) ?? null,
      upstreamImageUrls: record.outputImageUrls ?? [],
    },
  };
}

export async function getAssetByJobIdForUser(
  providerRequestId: string,
  userId: string
) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(asset)
    .where(
      and(
        eq(asset.providerRequestId, providerRequestId),
        eq(asset.userId, userId),
        eq(asset.type, 'image'),
        or(isNull(asset.isDelete), eq(asset.isDelete, false))
      )
    )
    .limit(1);

  return rows[0] ? mapAssetRecord(rows[0]) : null;
}

export async function getHomeImageStatusRecord(params: {
  providerRequestId: string;
  userId?: string | null;
  guestId?: string | null;
}) {
  if (params.userId) {
    const assetRecord = await getAssetByJobIdForUser(
      params.providerRequestId,
      params.userId
    );
    if (assetRecord) {
      return assetRecord;
    }

    const guestRecord = await getGuestGenerationByJobIdForUser(
      params.providerRequestId,
      params.userId
    );
    return guestRecord ? mapGuestRecord(guestRecord) : null;
  }

  if (!params.guestId) {
    return null;
  }

  const guestRecord = await getGuestGenerationByJobIdForGuest(
    params.providerRequestId,
    params.guestId
  );
  return guestRecord ? mapGuestRecord(guestRecord) : null;
}

export async function getHomeRecentRecordsForUser(userId: string, limit = 20) {
  const db = await getDb();
  const [assetRows, guestRows] = await Promise.all([
    db
      .select()
      .from(asset)
      .where(
        and(
          eq(asset.userId, userId),
          eq(asset.type, 'image'),
          or(isNull(asset.isDelete), eq(asset.isDelete, false))
        )
      )
      .orderBy(desc(asset.createdAt))
      .limit(limit),
    getGuestRecentByUserId(userId, limit),
  ]);

  return [...assetRows.map(mapAssetRecord), ...guestRows.map(mapGuestRecord)]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, limit);
}

export async function getHomeRecentRecordsForGuest(
  guestId: string,
  limit = 20
) {
  const rows = await getGuestRecentByGuestId(guestId, limit);
  return rows.map(mapGuestRecord);
}
