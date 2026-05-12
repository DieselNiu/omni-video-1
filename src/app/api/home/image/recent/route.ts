import { getDb } from '@/db';
import { asset } from '@/db/schema';
import {
  getRecentGuestGenerationsByGuestId,
  getRecentGuestGenerationsByUserId,
} from '@/image/data/guest-generation';
import { pickPublicImageUrls } from '@/image/utils/public-image-urls';
import {
  HOME_IMAGE_STALE_ERROR_MESSAGE,
  expireStaleHomeGeneration,
} from '@/image/utils/stale-home-generation';
import { auth } from '@/lib/auth';
import {
  getGuestCookieName,
  verifyGuestCookieValue,
} from '@/lib/home-image-security';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { toPublicHomeModelId } from '../_lib/constants';
import { jsonNoStore } from '../_lib/http';

// Server picks ONE URL (R2 if present, upstream as fallback) and
// returns it via `imageUrlsR2`. The `imageUrls` field is empty in
// responses so a DevTools-savvy user only ever sees the chosen URL —
// the upstream provider domain is never exposed alongside the R2 URL.
function mapAssetRecord(record: typeof asset.$inferSelect) {
  return {
    id: record.id,
    kind: 'asset',
    status: record.status,
    prompt: record.prompt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    imageUrlsR2: pickPublicImageUrls(
      record.outputImageUrlsR2,
      record.outputImageUrls
    ),
    errorMessage: record.errorMessage,
    modelId: toPublicHomeModelId(record.modelId),
    thumbnailUrl: record.thumbnailUrl,
  };
}

async function expireStaleRecentRecords(
  records: Array<{
    id: string;
    source: 'asset' | 'guest_generation';
    status: string;
    updatedAt: Date;
    errorMessage?: string | null;
  }>
) {
  const expiredIds = new Set<string>();

  await Promise.all(
    records.map(async (record) => {
      const expired = await expireStaleHomeGeneration(record);
      if (expired) {
        expiredIds.add(record.id);
      }
    })
  );

  return expiredIds;
}

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.id) {
    const db = await getDb();
    const assets = await db
      .select()
      .from(asset)
      .where(
        and(
          eq(asset.userId, session.user.id),
          eq(asset.type, 'image'),
          or(isNull(asset.isDelete), eq(asset.isDelete, false))
        )
      )
      .orderBy(desc(asset.createdAt))
      .limit(5);
    const claimedGuests = await getRecentGuestGenerationsByUserId(
      session.user.id
    );
    const expiredIds = await expireStaleRecentRecords([
      ...assets.map((record) => ({
        id: record.id,
        source: 'asset' as const,
        status: record.status,
        updatedAt: record.updatedAt,
        errorMessage: record.errorMessage,
      })),
      ...claimedGuests.map((record) => ({
        id: record.id,
        source: 'guest_generation' as const,
        status: record.status,
        updatedAt: record.updatedAt,
        errorMessage: record.errorMessage,
      })),
    ]);
    const merged = [
      ...assets.map((record) => {
        const mapped = mapAssetRecord(record);
        if (expiredIds.has(record.id)) {
          return {
            ...mapped,
            status: 'FAILED',
            errorMessage: HOME_IMAGE_STALE_ERROR_MESSAGE,
          };
        }
        return mapped;
      }),
      ...claimedGuests.map((record) => ({
        id: record.id,
        kind: 'guest_generation',
        status: expiredIds.has(record.id) ? 'FAILED' : record.status,
        prompt: record.prompt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        imageUrlsR2: pickPublicImageUrls(
          record.outputImageUrlsR2,
          record.outputImageUrls
        ),
        errorMessage: expiredIds.has(record.id)
          ? HOME_IMAGE_STALE_ERROR_MESSAGE
          : record.errorMessage,
        modelId: toPublicHomeModelId(record.modelId),
        thumbnailUrl: record.thumbnailUrl,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5);

    return jsonNoStore({ data: merged });
  }

  const cookieStore = await cookies();
  const guestId =
    (
      await verifyGuestCookieValue(
        cookieStore.get(getGuestCookieName())?.value ?? null
      )
    )?.id ?? null;
  if (!guestId) {
    return jsonNoStore({ data: [] });
  }

  const records = await getRecentGuestGenerationsByGuestId(guestId);
  const expiredIds = await expireStaleRecentRecords(
    records.map((record) => ({
      id: record.id,
      source: 'guest_generation' as const,
      status: record.status,
      updatedAt: record.updatedAt,
      errorMessage: record.errorMessage,
    }))
  );
  return jsonNoStore({
    data: records.map((record) => ({
      id: record.id,
      kind: 'guest_generation',
      status: expiredIds.has(record.id) ? 'FAILED' : record.status,
      prompt: record.prompt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      imageUrlsR2: pickPublicImageUrls(
        record.outputImageUrlsR2,
        record.outputImageUrls
      ),
      errorMessage: expiredIds.has(record.id)
        ? HOME_IMAGE_STALE_ERROR_MESSAGE
        : record.errorMessage,
      // Always map through the ProductModel translator — anonymous
      // guest rows could otherwise expose the executable id
      // (e.g. 'grok-imagine-lite').
      modelId: toPublicHomeModelId(record.modelId),
      thumbnailUrl: record.thumbnailUrl,
    })),
  });
}
