import { getDb } from '@/db';
import { asset, guestGeneration } from '@/db/schema';
import { expireStaleHomeGeneration } from '@/image/utils/stale-home-generation';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';

export const IMAGE_IN_PROGRESS_STATUSES = [
  'PENDING',
  'IN_QUEUE',
  'IN_PROGRESS',
  'PROCESSING',
] as const;

type DbExecutor = Awaited<ReturnType<typeof getDb>>;

interface CheckConcurrencyParams {
  executor?: DbExecutor;
  subjectType: 'guest' | 'user';
  /**
   * For `user`, this is the userId. For `guest`, this is the
   * `quotaBucketId` — NOT the guest cookie value. Keying the guest
   * lock on the quota bucket (which is derived from the stable
   * abuseBindKey) prevents an attacker from bypassing the "one
   * active generation" rule by rotating their guest_id cookie.
   */
  subjectId: string;
}

export interface ActiveHomeGeneration {
  id: string;
  source: 'asset' | 'guest_generation';
  providerRequestId: string | null;
  status: string;
  updatedAt: Date;
  /**
   * Only populated for guest_generation records. The caller can
   * compare this against their current guestId to decide whether
   * to expose the blocking jobId: mismatches mean the lock holder
   * is somebody else in the same quota bucket (or the same person
   * with a rotated cookie) — safer to return a generic error.
   */
  guestId?: string | null;
}

export async function hasActiveHomeGuestGeneration(
  quotaBucketId: string,
  executor?: DbExecutor
) {
  return Boolean(await getActiveHomeGuestGeneration(quotaBucketId, executor));
}

export async function getActiveHomeGuestGeneration(
  quotaBucketId: string,
  executor?: DbExecutor
): Promise<ActiveHomeGeneration | null> {
  const db = executor || (await getDb());
  const rows = await db
    .select({
      id: guestGeneration.id,
      guestId: guestGeneration.guestId,
      providerRequestId: guestGeneration.providerRequestId,
      status: guestGeneration.status,
      updatedAt: guestGeneration.updatedAt,
    })
    .from(guestGeneration)
    .where(
      and(
        eq(guestGeneration.quotaBucketId, quotaBucketId),
        isNull(guestGeneration.userId),
        inArray(guestGeneration.status, [...IMAGE_IN_PROGRESS_STATUSES])
      )
    )
    .orderBy(desc(guestGeneration.updatedAt))
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  const record: ActiveHomeGeneration = {
    id: rows[0].id,
    source: 'guest_generation',
    providerRequestId: rows[0].providerRequestId,
    status: rows[0].status,
    updatedAt: rows[0].updatedAt,
    guestId: rows[0].guestId,
  };

  if (await expireStaleHomeGeneration(record)) {
    return null;
  }

  return record;
}

export async function hasActiveHomeUserGeneration(
  userId: string,
  executor?: DbExecutor
) {
  return Boolean(await getActiveHomeUserGeneration(userId, executor));
}

export async function getActiveHomeUserGeneration(
  userId: string,
  executor?: DbExecutor
): Promise<ActiveHomeGeneration | null> {
  const db = executor || (await getDb());

  const [guestRows, assetRows] = await Promise.all([
    db
      .select({
        id: guestGeneration.id,
        providerRequestId: guestGeneration.providerRequestId,
        status: guestGeneration.status,
        updatedAt: guestGeneration.updatedAt,
      })
      .from(guestGeneration)
      .where(
        and(
          eq(guestGeneration.userId, userId),
          inArray(guestGeneration.status, [...IMAGE_IN_PROGRESS_STATUSES])
        )
      )
      .orderBy(desc(guestGeneration.updatedAt))
      .limit(1),
    db
      .select({
        id: asset.id,
        providerRequestId: asset.providerRequestId,
        status: asset.status,
        updatedAt: asset.updatedAt,
      })
      .from(asset)
      .where(
        and(
          eq(asset.userId, userId),
          eq(asset.type, 'image'),
          inArray(asset.status, [...IMAGE_IN_PROGRESS_STATUSES]),
          or(isNull(asset.isDelete), eq(asset.isDelete, false))
        )
      )
      .orderBy(desc(asset.updatedAt))
      .limit(1),
  ]);

  const guestRecord = guestRows[0]
    ? {
        id: guestRows[0].id,
        source: 'guest_generation' as const,
        providerRequestId: guestRows[0].providerRequestId,
        status: guestRows[0].status,
        updatedAt: guestRows[0].updatedAt,
      }
    : null;

  const assetRecord = assetRows[0]
    ? {
        id: assetRows[0].id,
        source: 'asset' as const,
        providerRequestId: assetRows[0].providerRequestId,
        status: assetRows[0].status,
        updatedAt: assetRows[0].updatedAt,
      }
    : null;

  const activeGuestRecord =
    guestRecord && !(await expireStaleHomeGeneration(guestRecord))
      ? guestRecord
      : null;
  const activeAssetRecord =
    assetRecord && !(await expireStaleHomeGeneration(assetRecord))
      ? assetRecord
      : null;

  if (!activeGuestRecord) {
    return activeAssetRecord;
  }

  if (!activeAssetRecord) {
    return activeGuestRecord;
  }

  return activeGuestRecord.updatedAt > activeAssetRecord.updatedAt
    ? activeGuestRecord
    : activeAssetRecord;
}

export async function checkImageConcurrency(
  params: CheckConcurrencyParams
): Promise<boolean> {
  if (params.subjectType === 'guest') {
    return !(await hasActiveHomeGuestGeneration(
      params.subjectId,
      params.executor
    ));
  }

  return !(await hasActiveHomeUserGeneration(
    params.subjectId,
    params.executor
  ));
}

export async function getActiveHomeGeneration(
  params: CheckConcurrencyParams
): Promise<ActiveHomeGeneration | null> {
  if (params.subjectType === 'guest') {
    return getActiveHomeGuestGeneration(params.subjectId, params.executor);
  }

  return getActiveHomeUserGeneration(params.subjectId, params.executor);
}
