import { addCredits, consumeCredits, getUserCredits } from '@/credits/credits';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { getDb } from '@/db';
import { creditTransaction } from '@/db/schema';
import { updateVideoGenerationById } from '@/video/data/video-generation';
import { and, eq } from 'drizzle-orm';
import {
  calculateVideoCredits as calculateCredits,
  getVideoModel,
} from './config/video-models';

export interface CreditDeductionInfo {
  totalDeducted: number;
  deductedAt: string;
  modelId: string;
  duration: number;
  hasAudio: boolean;
  resolution?: string;
  hasVideoInput?: boolean;
  // Frontend-facing label (e.g. "Gemini Omni") preserved across backend
  // model resolution so credit-history descriptions show the brand the
  // user actually picked, not the resolved provider model.
  displayLabel?: string;
}

/**
 * Calculate credits required for video generation
 * @param modelId - The model ID
 * @param duration - Duration in seconds
 * @param hasAudio - Whether audio is enabled
 * @param resolution - Video resolution (e.g., '720p', '1080p')
 * @returns Required credits
 */
export function calculateVideoCredits(
  modelId: string,
  duration: number,
  hasAudio = false,
  resolution?: string,
  hasVideoInput = false
): number {
  return calculateCredits(
    modelId,
    duration,
    hasAudio,
    resolution,
    hasVideoInput
  );
}

/**
 * Check if user has enough credits for video generation
 * @param userId - User ID
 * @param modelId - Model ID
 * @param duration - Duration in seconds
 * @param hasAudio - Whether audio is enabled
 * @param resolution - Video resolution (e.g., '720p', '1080p')
 * @returns Whether user has enough credits
 */
export async function hasEnoughCreditsForVideo(
  userId: string,
  modelId: string,
  duration: number,
  hasAudio = false,
  resolution?: string,
  hasVideoInput = false
): Promise<{ hasEnough: boolean; required: number; current: number }> {
  const required = calculateVideoCredits(
    modelId,
    duration,
    hasAudio,
    resolution,
    hasVideoInput
  );
  const current = await getUserCredits(userId);
  return {
    hasEnough: current >= required,
    required,
    current,
  };
}

/**
 * Consume credits for video generation
 * @param userId - User ID
 * @param modelId - Model ID
 * @param duration - Duration in seconds
 * @param hasAudio - Whether audio is enabled
 * @param resolution - Video resolution (e.g., '720p', '1080p')
 * @param assetId - Optional asset ID to link the transaction
 * @returns Credit deduction info for potential refund
 */
export async function consumeVideoCredits(
  userId: string,
  modelId: string,
  duration: number,
  hasAudio = false,
  resolution?: string,
  assetId?: string,
  displayLabel?: string,
  hasVideoInput = false
): Promise<CreditDeductionInfo> {
  const model = getVideoModel(modelId);
  const amount = calculateVideoCredits(
    modelId,
    duration,
    hasAudio,
    resolution,
    hasVideoInput
  );

  if (amount <= 0) {
    throw new Error('Invalid credit amount');
  }

  const resolutionStr = resolution ? `, ${resolution}` : '';
  const videoInputStr = hasVideoInput ? ', with video input' : '';
  const label = displayLabel || model?.displayName || modelId;
  const description = `Video generation: ${label} (${duration}s${resolutionStr}${hasAudio ? ', with audio' : ''}${videoInputStr})`;

  // Use existing consumeCredits function which handles FIFO logic
  await consumeCredits({
    userId,
    amount,
    description,
    assetId,
  });

  return {
    totalDeducted: amount,
    deductedAt: new Date().toISOString(),
    modelId,
    duration,
    hasAudio,
    resolution,
    hasVideoInput,
    displayLabel,
  };
}

/**
 * Refund credits for failed video generation.
 *
 * Idempotent at the DB level when `assetId` is provided: returns early
 * without writing if a refund row already exists for this asset. This is
 * the primary guard against double-refunds when the webhook, the in-page
 * status poll, and the cron sweeper race on the same failure.
 */
export async function refundVideoCredits(
  userId: string,
  deductionInfo: CreditDeductionInfo,
  assetId?: string
): Promise<boolean> {
  if (!deductionInfo || deductionInfo.totalDeducted <= 0) {
    console.warn('Invalid deduction info for refund');
    return false;
  }

  if (assetId) {
    const db = await getDb();
    const existing = await db
      .select({ id: creditTransaction.id })
      .from(creditTransaction)
      .where(
        and(
          eq(creditTransaction.assetId, assetId),
          eq(
            creditTransaction.type,
            CREDIT_TRANSACTION_TYPE.VIDEO_GENERATION_REFUND
          )
        )
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(
        `[Video] Refund already exists for asset ${assetId} — skipping`
      );
      return false;
    }
  }

  const model = getVideoModel(deductionInfo.modelId);
  const label =
    deductionInfo.displayLabel || model?.displayName || deductionInfo.modelId;
  const description = `Video generation refund: ${label} (${deductionInfo.duration}s${deductionInfo.hasAudio ? ', with audio' : ''}${deductionInfo.hasVideoInput ? ', with video input' : ''})`;

  await addCredits({
    userId,
    amount: deductionInfo.totalDeducted,
    type: CREDIT_TRANSACTION_TYPE.VIDEO_GENERATION_REFUND,
    description,
    expireDays: 30,
    assetId,
  });

  console.log(
    `Refunded ${deductionInfo.totalDeducted} credits to user ${userId} for failed video generation`
  );
  return true;
}

/**
 * Refund credits for a failed video asset.
 *
 * Resolves the deduction info from the record:
 *   metadata.creditDeduction (authoritative — set at submit time)
 *   → record.creditsUsed (fallback for older records / missing metadata)
 *
 * On a successful refund, stamps `metadata.refunded = true` and zeroes
 * `asset.creditsUsed` so audit views show the asset is settled. The
 * stamp is *not* the idempotency gate — `refundVideoCredits` checks the
 * DB directly for a prior refund row.
 *
 * Use this from every video FAILED branch (webhook, status poll,
 * sweeper) so that a missing `metadata.creditDeduction` no longer
 * silently swallows the refund.
 */
export async function refundVideoCreditsForAsset(record: {
  id: string;
  userId: string;
  modelId: string | null;
  creditsUsed: number | null;
  durationSeconds: number | null;
  hasAudio: boolean | null;
  resolution: string | null;
  metadata: Record<string, unknown> | null;
}): Promise<boolean> {
  const metadata = (record.metadata || {}) as Record<string, unknown>;

  // Kill-switch: if any prior path stamped `metadata.refunded` we trust
  // it and skip. Covers cases the DB-level (asset_id, *_REFUND) check
  // can't see — e.g. manual ops compensation issued as a GIFT row, or
  // an out-of-band refund channel — without giving the user a second
  // refund on top.
  if (metadata.refunded === true) {
    console.log(
      `[Video] Skipping refund — metadata.refunded already set for ${record.id}`
    );
    return false;
  }

  const metaDeduction = (metadata.creditDeduction ??
    null) as CreditDeductionInfo | null;

  const totalDeducted = metaDeduction?.totalDeducted ?? record.creditsUsed ?? 0;
  if (totalDeducted <= 0) return false;

  const deductionInfo: CreditDeductionInfo = {
    totalDeducted,
    deductedAt: metaDeduction?.deductedAt ?? new Date().toISOString(),
    modelId: metaDeduction?.modelId ?? record.modelId ?? 'unknown',
    duration: metaDeduction?.duration ?? record.durationSeconds ?? 0,
    hasAudio: metaDeduction?.hasAudio ?? record.hasAudio ?? false,
    resolution: metaDeduction?.resolution ?? record.resolution ?? undefined,
    hasVideoInput: metaDeduction?.hasVideoInput,
    displayLabel: metaDeduction?.displayLabel,
  };

  const refunded = await refundVideoCredits(
    record.userId,
    deductionInfo,
    record.id
  );

  if (refunded) {
    try {
      const metadata = (record.metadata || {}) as Record<string, unknown>;
      await updateVideoGenerationById(record.id, {
        metadata: { ...metadata, refunded: true },
        creditsUsed: 0,
      });
    } catch (err) {
      console.error(
        `[Video] Failed to stamp refunded metadata for ${record.id}:`,
        err
      );
    }
  }

  return refunded;
}

/**
 * Get remaining credits after video generation
 * @param userId - User ID
 * @returns Remaining credits
 */
export async function getRemainingCredits(userId: string): Promise<number> {
  return getUserCredits(userId);
}
