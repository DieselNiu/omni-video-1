import { getAssetById, updateAsset } from '@/assets/data/asset';
import { refundFreeQuota } from '@/credits/free-quota';
import {
  getGuestGenerationById,
  updateGuestGenerationById,
} from '@/image/data/guest-generation';
import { refundImageCredits } from './credits';

type HomeGenerationSource = 'asset' | 'guest_generation';
type FinalHomeGenerationStatus = 'FAILED' | 'CANCELLED';

function getFreeQuotaRefundState(
  metadata: Record<string, unknown> | null,
  fallbackBucketId?: string | null
) {
  const freeQuota =
    metadata && typeof metadata.freeQuota === 'object' && metadata.freeQuota
      ? (metadata.freeQuota as Record<string, unknown>)
      : null;

  const quotaBucketId =
    typeof metadata?.quotaBucketId === 'string'
      ? metadata.quotaBucketId
      : typeof freeQuota?.quotaBucketId === 'string'
        ? freeQuota.quotaBucketId
        : (fallbackBucketId ?? null);

  const refunded =
    metadata?.refunded === true || freeQuota?.refunded === true || false;

  return quotaBucketId
    ? {
        quotaBucketId,
        refunded,
      }
    : null;
}

function markRefundedMetadata(
  metadata: Record<string, unknown> | null,
  quotaBucketId?: string | null
) {
  const nextMetadata = {
    ...(metadata ?? {}),
    refunded: true,
  } as Record<string, unknown>;

  if (quotaBucketId && typeof nextMetadata.quotaBucketId !== 'string') {
    nextMetadata.quotaBucketId = quotaBucketId;
  }

  if (
    nextMetadata.freeQuota &&
    typeof nextMetadata.freeQuota === 'object' &&
    !Array.isArray(nextMetadata.freeQuota)
  ) {
    nextMetadata.freeQuota = {
      ...(nextMetadata.freeQuota as Record<string, unknown>),
      refunded: true,
      ...(quotaBucketId ? { quotaBucketId } : {}),
    };
  }

  return nextMetadata;
}

function getCreditRefundState(metadata: Record<string, unknown> | null) {
  if (!metadata || typeof metadata !== 'object' || metadata.refunded === true) {
    return null;
  }

  const creditDeduction =
    metadata.creditDeduction &&
    typeof metadata.creditDeduction === 'object' &&
    !Array.isArray(metadata.creditDeduction)
      ? (metadata.creditDeduction as Record<string, unknown>)
      : null;

  const amount =
    typeof creditDeduction?.amount === 'number' ? creditDeduction.amount : null;
  const modelId =
    typeof creditDeduction?.modelId === 'string'
      ? creditDeduction.modelId
      : null;

  if (!amount || !modelId) {
    return null;
  }

  return {
    amount,
    modelId,
  };
}

export async function finalizeHomeGenerationFailure(params: {
  source: HomeGenerationSource;
  id: string;
  status?: FinalHomeGenerationStatus;
  errorMessage: string;
  completedAt?: Date;
}) {
  const status = params.status ?? 'FAILED';
  const completedAt = params.completedAt ?? new Date();

  if (params.source === 'asset') {
    const record = await getAssetById({ id: params.id });
    if (!record) {
      return false;
    }

    const nextMetadata = record.metadata
      ? { ...record.metadata }
      : ({} as Record<string, unknown>);
    let metadataChanged = false;

    const freeQuota = getFreeQuotaRefundState(record.metadata);
    if (freeQuota && !freeQuota.refunded) {
      await refundFreeQuota({ bucketId: freeQuota.quotaBucketId });
      Object.assign(
        nextMetadata,
        markRefundedMetadata(record.metadata, freeQuota.quotaBucketId)
      );
      metadataChanged = true;
    } else {
      const creditRefund = getCreditRefundState(record.metadata);
      if (creditRefund && record.userId) {
        const refunded = await refundImageCredits(
          record.userId,
          creditRefund.amount,
          creditRefund.modelId,
          record.id
        );

        if (refunded) {
          Object.assign(nextMetadata, markRefundedMetadata(record.metadata));
          metadataChanged = true;
        }
      }
    }

    await updateAsset({
      id: params.id,
      status,
      errorMessage: params.errorMessage,
      ...(metadataChanged ? { metadata: nextMetadata } : {}),
    });

    return true;
  }

  const record = await getGuestGenerationById(params.id);
  if (!record) {
    return false;
  }

  const nextMetadata = record.metadata
    ? { ...record.metadata }
    : ({} as Record<string, unknown>);
  let metadataChanged = false;

  const freeQuota = getFreeQuotaRefundState(
    record.metadata,
    record.quotaBucketId
  );
  if (freeQuota && !freeQuota.refunded) {
    await refundFreeQuota({ bucketId: freeQuota.quotaBucketId });
    Object.assign(
      nextMetadata,
      markRefundedMetadata(record.metadata, freeQuota.quotaBucketId)
    );
    metadataChanged = true;
  }

  await updateGuestGenerationById(params.id, {
    status,
    errorMessage: params.errorMessage,
    completedAt,
    ...(metadataChanged ? { metadata: nextMetadata } : {}),
  });

  return true;
}
