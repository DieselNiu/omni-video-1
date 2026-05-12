import { updateAsset } from '@/assets/data/asset';
import { getImageProvider } from '@/image';
import { updateGuestGenerationById } from '@/image/data/guest-generation';
import { finalizeHomeGenerationFailure } from '@/image/utils/finalize-home-generation-failure';
import { persistGeneratedImageResult } from '@/image/utils/provider-submit';
import { pickPublicImageUrls } from '@/image/utils/public-image-urls';
import {
  HOME_IMAGE_STALE_ERROR_MESSAGE,
  isStaleHomeGeneration,
} from '@/image/utils/stale-home-generation';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { HOME_IMAGE_ERROR, toPublicHomeModelId } from '../_lib/constants';
import { jsonNoStore } from '../_lib/http';
import { getHomeImageStatusRecord } from '../_lib/records';
import { getVerifiedGuestId } from '../_lib/request';

const IN_PROGRESS_STATUSES = [
  'PENDING',
  'IN_QUEUE',
  'IN_PROGRESS',
  'PROCESSING',
];

async function updateHomeRecordForSuccess(params: {
  source: 'asset' | 'guest_generation';
  id: string;
  imageUrls: string[];
  imageUrlsR2: string[];
  thumbnailUrl: string;
}) {
  if (params.source === 'asset') {
    await updateAsset({
      id: params.id,
      status: 'SAVED_TO_R2',
      outputImageUrls: params.imageUrls,
      outputImageUrlsR2: params.imageUrlsR2,
      thumbnailUrl: params.thumbnailUrl,
    });
    return;
  }

  await updateGuestGenerationById(params.id, {
    status: 'SAVED_TO_R2',
    outputImageUrls: params.imageUrls,
    outputImageUrlsR2: params.imageUrlsR2,
    thumbnailUrl: params.thumbnailUrl,
    completedAt: new Date(),
  });
}

async function updateHomeRecordForFailure(params: {
  source: 'asset' | 'guest_generation';
  id: string;
  errorMessage: string;
}) {
  await finalizeHomeGenerationFailure({
    source: params.source,
    id: params.id,
    status: 'FAILED',
    errorMessage: params.errorMessage,
  });
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    const jobId = request.nextUrl.searchParams.get('jobId')?.trim();

    if (!jobId) {
      return jsonNoStore(
        { error: HOME_IMAGE_ERROR.INVALID_PARAMS },
        { status: 400 }
      );
    }

    const record = session?.user?.id
      ? await getHomeImageStatusRecord({
          providerRequestId: jobId,
          userId: session.user.id,
        })
      : await (async () => {
          const guestId = await getVerifiedGuestId(request);
          if (!guestId) {
            return 'guest-cookie-missing' as const;
          }

          return getHomeImageStatusRecord({
            providerRequestId: jobId,
            guestId,
          });
        })();

    if (record === 'guest-cookie-missing') {
      return jsonNoStore(
        { error: HOME_IMAGE_ERROR.GUEST_COOKIE_MISSING },
        { status: 400 }
      );
    }

    if (!record) {
      return jsonNoStore(
        { error: HOME_IMAGE_ERROR.RECORD_NOT_FOUND },
        { status: 404 }
      );
    }

    // Internal fields (channel/metadata) are nested under `record._internal`
    // by the mapper, so spreading `record` is safe by construction; we
    // still drop the `_internal` key from the public payload.
    //
    // URL handling: server picks ONE URL (R2 if present, upstream as
    // fallback) and exposes it via `imageUrlsR2`. The `imageUrls` field
    // is always empty in responses so a DevTools-savvy user only ever
    // sees the chosen URL — never two URLs side by side that would
    // reveal the upstream provider domain.
    const { _internal, ...recordPublic } = record;
    const publicRecord = {
      ...recordPublic,
      modelId: toPublicHomeModelId(record.modelId),
      // Single chosen URL — no separate `imageUrls` slot to avoid ever
      // exposing both the R2 URL and the upstream URL side by side.
      imageUrlsR2: pickPublicImageUrls(
        recordPublic.imageUrlsR2,
        _internal.upstreamImageUrls
      ),
    };

    if (
      IN_PROGRESS_STATUSES.includes(record.status) &&
      record.providerRequestId &&
      record.modelId
    ) {
      try {
        const { provider } = await getImageProvider(
          record.modelId,
          undefined,
          record._internal.channel
        );

        if (provider.result) {
          const providerResult = await provider.result(
            record.modelId,
            record.providerRequestId
          );

          if (
            providerResult.status === 'COMPLETED' &&
            providerResult.image_urls?.length
          ) {
            const persisted = await persistGeneratedImageResult({
              recordId: record.id,
              imageUrl: providerResult.image_urls[0],
              userId: session?.user?.id ?? null,
            });

            await updateHomeRecordForSuccess({
              source: record.source,
              id: record.id,
              imageUrls: persisted.imageUrls,
              imageUrlsR2: persisted.imageUrlsR2,
              thumbnailUrl: persisted.thumbnailUrl,
            });

            return jsonNoStore({
              ...publicRecord,
              status: 'SAVED_TO_R2',
              imageUrlsR2: pickPublicImageUrls(
                persisted.imageUrlsR2,
                persisted.imageUrls
              ),
              thumbnailUrl: persisted.thumbnailUrl,
              errorMessage: null,
            });
          }

          if (providerResult.status === 'FAILED') {
            const errorMessage =
              providerResult.error_message || 'Generation failed';

            await updateHomeRecordForFailure({
              source: record.source,
              id: record.id,
              errorMessage,
            });

            return jsonNoStore({
              ...publicRecord,
              status: 'FAILED',
              errorMessage,
            });
          }
        }
      } catch (error) {
        console.warn(
          `[home-image.status] provider fallback failed for ${record.id}:`,
          error instanceof Error ? error.message : error
        );
      }

      if (isStaleHomeGeneration(record.updatedAt)) {
        await updateHomeRecordForFailure({
          source: record.source,
          id: record.id,
          errorMessage: HOME_IMAGE_STALE_ERROR_MESSAGE,
        });

        return jsonNoStore({
          ...publicRecord,
          status: 'FAILED',
          errorMessage: HOME_IMAGE_STALE_ERROR_MESSAGE,
        });
      }
    }

    return jsonNoStore(publicRecord);
  } catch (error) {
    console.error('[home-image.status] error:', error);
    return jsonNoStore({ error: 'Internal server error' }, { status: 500 });
  }
}
