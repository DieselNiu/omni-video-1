/**
 * Image generation credit utilities
 */

import { addCredits } from '@/credits/credits';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { getDb } from '@/db';
import { creditTransaction } from '@/db/schema';
import { updateImageGenerationById } from '@/image/data/image-generation';
import { and, eq } from 'drizzle-orm';

/**
 * Refund credits for a failed image generation.
 *
 * Idempotent at the DB level: returns false without writing if a refund
 * row already exists for this asset, regardless of `metadata.refunded`
 * stamping. This is the primary guard against double-refunds when the
 * webhook, the user-page status poll, and the cron sweeper all race to
 * observe the same failure.
 */
export async function refundImageCredits(
  userId: string,
  amount: number,
  modelId: string,
  recordId: string
): Promise<boolean> {
  if (amount <= 0) return false;

  try {
    const db = await getDb();
    const existing = await db
      .select({ id: creditTransaction.id })
      .from(creditTransaction)
      .where(
        and(
          eq(creditTransaction.assetId, recordId),
          eq(
            creditTransaction.type,
            CREDIT_TRANSACTION_TYPE.IMAGE_GENERATION_REFUND
          )
        )
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(
        `[Image] Refund already exists for asset ${recordId} — skipping`
      );
      return false;
    }

    await addCredits({
      userId,
      amount,
      type: CREDIT_TRANSACTION_TYPE.IMAGE_GENERATION_REFUND,
      description: `Image generation refund: ${modelId} (asset: ${recordId})`,
      expireDays: 30,
      assetId: recordId,
    });

    console.log(
      `[Image] Credits refunded: userId=${userId}, amount=${amount}, recordId=${recordId}`
    );

    return true;
  } catch (error) {
    console.error('[Image] Failed to refund credits:', error);
    return false;
  }
}

/**
 * Resolve the refund amount + identity from a record, then run an
 * idempotent refund. Closes the gap where polling/sweeper paths only
 * had a stale record in memory: tries `metadata.creditDeduction.amount`
 * first (authoritative — set at submit time), then falls back to
 * `record.creditsUsed`.
 *
 * On a successful refund, clears `asset.creditsUsed` to 0 and stamps
 * `metadata.refunded = true` so audit views show the asset is settled.
 * The stamp is *not* the idempotency gate (the DB-level check inside
 * `refundImageCredits` is) — it's purely a human-readable marker.
 */
export async function refundImageCreditsForAsset(record: {
  id: string;
  userId: string;
  modelId: string | null;
  creditsUsed: number | null;
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
      `[Image] Skipping refund — metadata.refunded already set for ${record.id}`
    );
    return false;
  }

  const creditsToRefund =
    (metadata.creditDeduction as { amount?: number } | undefined)?.amount ||
    record.creditsUsed ||
    0;

  if (creditsToRefund <= 0) return false;

  const refunded = await refundImageCredits(
    record.userId,
    creditsToRefund,
    record.modelId || 'unknown',
    record.id
  );

  if (refunded) {
    try {
      await updateImageGenerationById(record.id, {
        metadata: { ...metadata, refunded: true },
        creditsUsed: 0,
      });
    } catch (err) {
      console.error(
        `[Image] Failed to stamp refunded metadata for ${record.id}:`,
        err
      );
    }
  }

  return refunded;
}
