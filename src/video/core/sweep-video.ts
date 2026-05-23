import { getStorageProvider } from '@/storage';
import { getVideoProvider } from '@/video';
import { refundVideoCreditsForAsset } from '@/video/credits';
import { updateVideoGenerationById } from '@/video/data/video-generation';

/**
 * Minimal record shape the sweeper feeds in. Matches the columns we read
 * out of the `asset` table for video generations.
 */
export interface SweepableVideoRecord {
  id: string;
  userId: string;
  modelId: string | null;
  status: string;
  providerRequestId: string | null;
  metadata: Record<string, unknown> | null;
  updatedAt: Date | null;
  /**
   * The channel that handled the original submit. Pinned when polling so
   * we always ask the same provider that owns this `providerRequestId`,
   * even if the channel router has since been re-pointed.
   */
  channel: string | null;
  /**
   * Fields below feed `refundVideoCreditsForAsset`'s fallback chain so we
   * can refund even when `metadata.creditDeduction` is missing (older
   * records, submit-time crashes, etc.).
   */
  creditsUsed: number | null;
  durationSeconds: number | null;
  hasAudio: boolean | null;
  resolution: string | null;
}

export type SweepOutcome =
  | 'resolved'
  | 'stillProcessing'
  | 'forceFailed'
  | 'error';

/**
 * Force a stuck video asset into FAILED + refund. Used by the cron
 * sweeper when an asset has been PROCESSING past the force-fail age,
 * regardless of what the provider still claims. Refund is DB-level
 * idempotent (see `refundVideoCreditsForAsset`).
 */
export async function forceFailVideoAsset(
  record: SweepableVideoRecord,
  errorMessage = 'Generation timed out (no provider response)'
): Promise<void> {
  await updateVideoGenerationById(record.id, {
    status: 'FAILED',
    errorMessage,
  });
  await refundVideoCreditsForAsset(record);
}

/**
 * Poll the provider for a single stuck video generation and update the
 * asset accordingly. Standalone (no auth, no HTTP response) so the cron
 * sweeper can call it on records nobody is actively viewing.
 *
 * Logic intentionally mirrors `app/api/video-generation/status/route.ts`:
 * - COMPLETED + video_url → download, upload to R2, persist URLs.
 * - FAILED → idempotent refund + mark FAILED.
 * - else → leave the DB alone, return 'stillProcessing'.
 */
export async function sweepVideoAsset(
  record: SweepableVideoRecord
): Promise<SweepOutcome> {
  if (!record.providerRequestId || !record.modelId) {
    // Submit never got a task ID back — provider call failed before the
    // record could be wired up. Treat as dead so the caller can refund.
    return 'stillProcessing';
  }

  try {
    const { provider } = await getVideoProvider(record.modelId, record.channel);
    const providerStatus = await provider.status(
      record.modelId,
      record.providerRequestId
    );

    if (providerStatus.status === 'COMPLETED') {
      const result = await provider.result(
        record.modelId,
        record.providerRequestId
      );

      if (result.video_url) {
        let videoUrlR2: string | null = null;
        try {
          const storage = getStorageProvider();
          const fileName = `generated/videos/${record.id}.mp4`;
          const uploadResult = await storage.downloadAndUpload({
            url: result.video_url,
            key: fileName,
            contentType: 'video/mp4',
          });
          if (uploadResult.url) videoUrlR2 = uploadResult.url;
        } catch (storageError) {
          console.error(
            `[sweep-video] R2 upload failed for ${record.id}:`,
            storageError instanceof Error ? storageError.message : storageError
          );
        }

        await updateVideoGenerationById(record.id, {
          status: videoUrlR2 ? 'SAVED_TO_R2' : 'COMPLETED',
          videoUrl: result.video_url,
          videoUrlR2: videoUrlR2 || undefined,
        });
        return 'resolved';
      }
      // Provider says COMPLETED but no URL — treat as failure so the
      // user gets their credits back rather than staring at a broken
      // record forever.
      await updateVideoGenerationById(record.id, {
        status: 'FAILED',
        errorMessage: 'Provider reported completion without a video URL',
      });
      await refundVideoCreditsForAsset(record);
      return 'resolved';
    }

    if (providerStatus.status === 'FAILED') {
      const errMsg = providerStatus.error_message || 'Video generation failed';
      await updateVideoGenerationById(record.id, {
        status: 'FAILED',
        errorMessage: errMsg,
      });
      await refundVideoCreditsForAsset(record);
      return 'resolved';
    }

    return 'stillProcessing';
  } catch (err) {
    console.error(
      `[sweep-video] provider check failed for ${record.id}:`,
      err instanceof Error ? err.message : err
    );
    return 'error';
  }
}
