import { timingSafeEqual } from 'crypto';
import { jsonNoStore } from '@/app/api/home/image/_lib/http';
import { parseMaxApiWebhook } from '@/app/api/video-generation/webhook/lib/webhook-handlers';
import { getAssetByProviderRequestId, updateAsset } from '@/assets/data/asset';
import { refundFreeQuota } from '@/credits/free-quota';
import {
  getGuestGenerationByProviderRequestId,
  updateGuestGenerationById,
} from '@/image/data/guest-generation';
import { refundImageCredits } from '@/image/utils/credits';
import { persistGeneratedImageResult } from '@/image/utils/provider-submit';

type HomeWebhookRecord =
  | {
      kind: 'asset';
      id: string;
      userId: string | null;
      metadata: Record<string, unknown> | null;
    }
  | {
      kind: 'guest_generation';
      id: string;
      userId: string | null;
      metadata: Record<string, unknown> | null;
    };

function getFreeQuotaMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const quotaBucketId =
    typeof metadata.quotaBucketId === 'string'
      ? metadata.quotaBucketId
      : typeof (metadata.freeQuota as Record<string, unknown> | undefined)
            ?.quotaBucketId === 'string'
        ? ((metadata.freeQuota as Record<string, unknown>)
            .quotaBucketId as string)
        : null;

  const refunded =
    metadata.refunded === true ||
    (typeof metadata.freeQuota === 'object' &&
      (metadata.freeQuota as Record<string, unknown>).refunded === true);

  if (!quotaBucketId) {
    return null;
  }

  return {
    quotaBucketId,
    refunded,
  };
}

async function findHomeWebhookRecord(providerRequestId: string) {
  const assetRecord = await getAssetByProviderRequestId(providerRequestId);
  if (assetRecord) {
    return {
      kind: 'asset' as const,
      id: assetRecord.id,
      userId: assetRecord.userId,
      metadata:
        (assetRecord.metadata as Record<string, unknown> | null) ?? null,
    };
  }

  const guestRecord =
    await getGuestGenerationByProviderRequestId(providerRequestId);
  if (!guestRecord) {
    return null;
  }

  return {
    kind: 'guest_generation' as const,
    id: guestRecord.id,
    userId: guestRecord.userId,
    metadata: guestRecord.metadata,
  };
}

async function updateWebhookRecordForSuccess(params: {
  record: HomeWebhookRecord;
  imageUrls: string[];
  imageUrlsR2: string[];
  thumbnailUrl: string;
}) {
  if (params.record.kind === 'asset') {
    await updateAsset({
      id: params.record.id,
      status: 'SAVED_TO_R2',
      outputImageUrls: params.imageUrls,
      outputImageUrlsR2: params.imageUrlsR2,
      thumbnailUrl: params.thumbnailUrl,
    });
    return;
  }

  await updateGuestGenerationById(params.record.id, {
    status: 'SAVED_TO_R2',
    outputImageUrls: params.imageUrls,
    outputImageUrlsR2: params.imageUrlsR2,
    thumbnailUrl: params.thumbnailUrl,
    completedAt: new Date(),
  });
}

async function updateWebhookRecordForFailure(
  record: HomeWebhookRecord,
  errorMessage: string
) {
  if (record.kind === 'asset') {
    await updateAsset({
      id: record.id,
      status: 'FAILED',
      errorMessage,
    });
    return;
  }

  await updateGuestGenerationById(record.id, {
    status: 'FAILED',
    errorMessage,
    completedAt: new Date(),
  });
}

function isGuardedWebhookAuthorized(request: Request) {
  const expected = process.env.MAXAPI_WEBHOOK_SECRET;
  if (!expected) {
    return false;
  }

  const url = new URL(request.url);
  const token =
    url.searchParams.get('token') ||
    request.headers.get('x-maxapi-webhook-secret') ||
    request.headers.get('x-webhook-token');

  if (!token) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);

  return (
    expectedBuffer.length === tokenBuffer.length &&
    timingSafeEqual(expectedBuffer, tokenBuffer)
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = parseMaxApiWebhook(body);

    if (!parsed) {
      return jsonNoStore({ error: 'Invalid webhook' }, { status: 400 });
    }

    const record = await findHomeWebhookRecord(parsed.taskId);

    if (!record) {
      return jsonNoStore({ error: 'Not found' }, { status: 404 });
    }

    const requiresGuardedToken =
      record.kind === 'guest_generation' ||
      !!getFreeQuotaMetadata(record.metadata);

    if (requiresGuardedToken && !isGuardedWebhookAuthorized(request)) {
      return jsonNoStore({ error: 'Unauthorized webhook' }, { status: 401 });
    }

    if (parsed.isSuccess && parsed.videoUrl) {
      const persisted = await persistGeneratedImageResult({
        recordId: record.id,
        imageUrl: parsed.videoUrl,
        userId: record.userId,
      });

      await updateWebhookRecordForSuccess({
        record,
        imageUrls: persisted.imageUrls,
        imageUrlsR2: persisted.imageUrlsR2,
        thumbnailUrl: persisted.thumbnailUrl,
      });

      return jsonNoStore({ status: 'ok' });
    }

    if (parsed.isFailed) {
      await updateWebhookRecordForFailure(
        record,
        parsed.errorMessage || 'Image generation failed'
      );

      const freeQuota = getFreeQuotaMetadata(record.metadata);
      if (freeQuota?.quotaBucketId && !freeQuota.refunded) {
        await refundFreeQuota({ bucketId: freeQuota.quotaBucketId });
        if (record.kind === 'asset') {
          await updateAsset({
            id: record.id,
            metadata: {
              ...(record.metadata || {}),
              refunded: true,
            },
          });
        } else {
          await updateGuestGenerationById(record.id, {
            metadata: {
              ...(record.metadata || {}),
              refunded: true,
            },
          });
        }
        return jsonNoStore({ status: 'ok' });
      }

      const metadata = (record.metadata || {}) as Record<string, unknown>;
      const creditDeduction = metadata.creditDeduction as
        | { amount?: number; modelId?: string }
        | undefined;

      if (
        record.kind === 'asset' &&
        creditDeduction?.amount &&
        creditDeduction?.modelId &&
        !metadata.refunded &&
        record.userId
      ) {
        const refunded = await refundImageCredits(
          record.userId,
          creditDeduction.amount,
          creditDeduction.modelId,
          record.id
        );

        if (refunded) {
          await updateAsset({
            id: record.id,
            metadata: {
              ...metadata,
              refunded: true,
            },
          });
        }
      }

      return jsonNoStore({ status: 'ok' });
    }

    return jsonNoStore({ status: 'ok' });
  } catch (error) {
    console.error('[Image Webhook] Unexpected error:', error);
    return jsonNoStore({ error: 'Internal server error' }, { status: 500 });
  }
}
