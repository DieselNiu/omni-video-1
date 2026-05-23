import { getImageProvider } from '@/image';
import { updateImageGenerationById } from '@/image/data/image-generation';
import { refundImageCreditsForAsset } from '@/image/utils/credits';
import { pickPublicImageUrls } from '@/image/utils/public-image-urls';
import {
  applyImageWatermark,
  shouldApplyImageWatermark,
  stripImageMetadata,
} from '@/lib/watermark';
import { getStorageProvider } from '@/storage';
import sharp from 'sharp';

/**
 * Statuses that indicate the task is still in-progress on our side
 * and worth actively polling the provider as a webhook fallback.
 */
const IN_PROGRESS_STATUSES = [
  'PENDING',
  'IN_QUEUE',
  'IN_PROGRESS',
  'PROCESSING',
];

export type UrlPolicy =
  /**
   * Web behavior: prefer R2 URLs, but fall back to the upstream provider
   * URL when R2 upload hasn't completed yet — robustness for the long
   * tail of R2 hiccups outweighs the small leak risk to DevTools-savvy
   * users (mitigation: a future image-proxy route can serve through our
   * own domain without changing this policy).
   */
  | 'r2-or-fallback'
  /** API behavior: never expose provider URL; return pending if R2 fails. */
  | 'r2-only';

/** Shape we need from the asset/image_generation record. */
export interface ResolvableRecord {
  id: string;
  userId: string;
  modelId: string | null;
  prompt: string | null;
  status: string;
  providerRequestId: string | null;
  outputImageUrls: string[] | null;
  outputImageUrlsR2: string[] | null;
  errorMessage: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  /**
   * Required so the polling fallback can refund credits when it detects a
   * provider-side FAILED state. `metadata.refunded` is used as the idempotency
   * guard shared with the webhook callbacks.
   */
  creditsUsed: number | null;
  metadata: Record<string, unknown> | null;
  /**
   * The channel that handled the original submit. Pinned when polling so
   * we always ask the same provider that owns this `providerRequestId`,
   * even if the channel router has since been re-pointed at a different
   * upstream.
   */
  channel: string | null;
}

/**
 * Public response shape. The server picks ONE URL per asset (R2 if
 * present, upstream as fallback under `r2-or-fallback`) and returns it
 * via `imageUrlsR2`. There is no parallel `imageUrls` field — clients
 * only ever see the chosen URL, so the upstream provider domain is
 * never visible alongside the R2 URL.
 */
export interface ResolveResult {
  id: string;
  status: string;
  modelId: string | null;
  prompt: string | null;
  imageUrlsR2: string[] | null;
  errorMessage: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  /**
   * Whether the live provider was successfully contacted during this
   * resolve call.
   *
   * - `'reached'`: provider returned a status we trust (still PROCESSING,
   *   COMPLETED, or FAILED). Safe for callers like the cron sweeper to
   *   treat the status as authoritative.
   * - `'unreached'`: we tried to poll but the provider threw / timed out /
   *   was misconfigured — the returned `status` is just the DB state and
   *   shouldn't be used to make destructive decisions (e.g. force-fail +
   *   refund) because the provider may still hold a real result.
   * - `'skipped'`: we didn't probe — the record was already in a final
   *   state, or had no providerRequestId/modelId to query.
   */
  providerProbe: 'reached' | 'unreached' | 'skipped';
}

/**
 * Resolve the current status of an image generation record.
 *
 * If the DB still shows the task in-progress but the provider has a
 * completed result, download + persist to R2 (same behavior the webhook
 * would perform) and return the updated state. This closes the gap when
 * webhooks are late or missing.
 *
 * Ownership must already be verified by the caller.
 */
export async function resolveImageGenerationStatus(
  record: ResolvableRecord,
  options: { urlPolicy: UrlPolicy }
): Promise<ResolveResult> {
  const { urlPolicy } = options;

  // Track whether we actually talked to the provider this call. Drives the
  // `providerProbe` field on the result so cron-style callers can refuse
  // to make destructive decisions (force-fail + refund) when the provider
  // was unreachable.
  let providerProbe: ResolveResult['providerProbe'] = 'skipped';

  if (
    IN_PROGRESS_STATUSES.includes(record.status) &&
    record.providerRequestId &&
    record.modelId
  ) {
    try {
      // Pin to the channel that handled submit — see `ResolvableRecord.channel`.
      const { provider } = await getImageProvider(
        record.modelId,
        undefined,
        record.channel
      );

      if (provider.result) {
        const providerResult = await provider.result(
          record.modelId,
          record.providerRequestId
        );
        // Provider answered (any status) — record this so callers know the
        // downstream view is authoritative for this poll.
        providerProbe = 'reached';

        if (
          providerResult.status === 'COMPLETED' &&
          providerResult.image_urls?.length
        ) {
          const imageUrl = providerResult.image_urls[0];

          try {
            const storage = getStorageProvider();
            const needsWatermark = await shouldApplyImageWatermark(
              record.userId
            );

            const imgResponse = await fetch(imageUrl);
            if (!imgResponse.ok) {
              throw new Error(
                `Failed to download image: ${imgResponse.status}`
              );
            }
            const arrayBuffer = await imgResponse.arrayBuffer();
            let finalBuffer = Buffer.from(arrayBuffer);

            if (needsWatermark) {
              const metadata = await sharp(finalBuffer).metadata();
              const w = metadata.width || 1024;
              const h = metadata.height || 1024;
              finalBuffer = Buffer.from(
                await applyImageWatermark(finalBuffer, w, h)
              );
            } else {
              // Even without a watermark, re-encode through sharp to strip
              // any upstream EXIF / XMP tags (e.g. `Software: xAI Grok`)
              // that would identify the real backend.
              finalBuffer = Buffer.from(await stripImageMetadata(finalBuffer));
            }

            const fileName = `generated/images/${record.id}.png`;
            const uploadResult = await storage.upload(
              fileName,
              finalBuffer,
              'image/png'
            );

            await updateImageGenerationById(record.id, {
              status: 'SAVED_TO_R2',
              imageUrls: providerResult.image_urls,
              imageUrlsR2: [uploadResult.url],
            });

            return {
              id: record.id,
              status: 'SAVED_TO_R2',
              modelId: record.modelId,
              prompt: record.prompt,
              imageUrlsR2: [uploadResult.url],
              errorMessage: null,
              createdAt: record.createdAt,
              updatedAt: record.updatedAt,
              providerProbe,
            };
          } catch (processError) {
            console.error(
              '[resolveImageGenerationStatus] R2 processing failed:',
              processError
            );

            if (urlPolicy === 'r2-only') {
              // API contract: never leak provider URLs. Leave the DB
              // record in-progress; caller should surface "pending" and
              // retry later.
              return {
                id: record.id,
                status: record.status,
                modelId: record.modelId,
                prompt: record.prompt,
                imageUrlsR2: null,
                errorMessage: null,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt,
                providerProbe,
              };
            }

            // Web fallback: persist COMPLETED with provider URLs so the
            // UI can still display the image rather than appearing stuck.
            // The upstream URL is exposed via `imageUrlsR2` (the public
            // slot); `imageUrls` stays empty so the client never sees
            // two URLs side by side that would reveal the backend.
            await updateImageGenerationById(record.id, {
              status: 'COMPLETED',
              imageUrls: providerResult.image_urls,
            });

            return {
              id: record.id,
              status: 'COMPLETED',
              modelId: record.modelId,
              prompt: record.prompt,
              imageUrlsR2: providerResult.image_urls,
              errorMessage: null,
              createdAt: record.createdAt,
              updatedAt: record.updatedAt,
              providerProbe,
            };
          }
        }

        if (providerResult.status === 'FAILED') {
          await updateImageGenerationById(record.id, {
            status: 'FAILED',
            errorMessage: providerResult.error_message || 'Generation failed',
          });

          // Refund is idempotent via `metadata.refunded`, so it's safe to run
          // even if the webhook later races and tries to refund the same
          // record.
          await refundImageCreditsForAsset({
            id: record.id,
            userId: record.userId,
            modelId: record.modelId,
            creditsUsed: record.creditsUsed,
            metadata: record.metadata,
          });

          return {
            id: record.id,
            status: 'FAILED',
            modelId: record.modelId,
            prompt: record.prompt,
            imageUrlsR2: null,
            errorMessage: providerResult.error_message || 'Generation failed',
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            providerProbe,
          };
        }

        // Provider still in-progress — fall through to DB state.
      }
    } catch (providerError) {
      console.warn(
        `[resolveImageGenerationStatus] provider check failed for ${record.id}:`,
        providerError instanceof Error ? providerError.message : providerError
      );
      // We attempted to probe but it threw — DB state below is stale, not
      // confirmed-still-processing.
      providerProbe = 'unreached';
    }
  }

  // Default: return DB state. r2-only never exposes upstream URLs;
  // r2-or-fallback picks R2 if present, otherwise upstream — and surfaces
  // the chosen URL via `imageUrlsR2` only (never both fields populated).
  const dbImageUrlsR2 = record.outputImageUrlsR2;
  const dbImageUrls = record.outputImageUrls;
  const hasR2 = dbImageUrlsR2 && dbImageUrlsR2.length > 0;

  let chosen: string[] | null;
  if (hasR2) {
    chosen = dbImageUrlsR2;
  } else if (urlPolicy === 'r2-only') {
    chosen = null;
  } else {
    chosen = pickPublicImageUrls(dbImageUrlsR2, dbImageUrls);
  }

  return {
    id: record.id,
    status: record.status,
    modelId: record.modelId,
    prompt: record.prompt,
    imageUrlsR2: chosen,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    providerProbe,
  };
}
