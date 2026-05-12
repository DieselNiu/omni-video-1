import { websiteConfig } from '@/config/website';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { getWatermarkText } from '@/lib/brand';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';

export function isWatermarkFeatureEnabled(): boolean {
  return websiteConfig.features.enableWatermark === true;
}

/**
 * Check if a user requires watermarks on their generated content.
 * Watermarks are required for users who have never made any paid payment.
 */
export async function isWatermarkRequired(userId: string): Promise<boolean> {
  if (!isWatermarkFeatureEnabled()) {
    return false;
  }

  const db = await getDb();

  const paidRecord = await db
    .select({ id: payment.id })
    .from(payment)
    .where(and(eq(payment.userId, userId), eq(payment.paid, true)))
    .limit(1);

  return paidRecord.length === 0;
}

export async function shouldApplyImageWatermark(
  userId?: string | null
): Promise<boolean> {
  if (!isWatermarkFeatureEnabled()) {
    return false;
  }

  if (!userId) {
    return true;
  }

  return isWatermarkRequired(userId);
}

/**
 * Apply a branded watermark to an image buffer using sharp.
 * The watermark is placed at the bottom-right corner with white semi-transparent text.
 */
export async function applyImageWatermark(
  imageBuffer: Buffer | Uint8Array,
  width: number,
  height: number
): Promise<Buffer> {
  const text = getWatermarkText()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
  const fontSize = Math.max(16, Math.round(Math.min(width, height) * 0.04));
  const padding = Math.round(fontSize * 1.2);

  const svgOverlay = Buffer.from(`
    <svg width="${width}" height="${height}">
      <style>
        .watermark {
          fill: rgba(255, 255, 255, 0.5);
          font-size: ${fontSize}px;
          font-family: Arial, Helvetica, sans-serif;
          font-weight: 600;
        }
      </style>
      <text
        x="${width - padding}"
        y="${height - padding}"
        text-anchor="end"
        class="watermark"
      >${text}</text>
    </svg>
  `);

  // sharp's default is to drop metadata when re-encoding, but we don't
  // call `.withMetadata()` here so any upstream EXIF tags (e.g. a
  // `Software: xAI Grok` marker) are stripped along with the watermark
  // composite. Re-encoding to PNG ensures a clean output regardless of
  // the source format.
  const result = await sharp(imageBuffer)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .png()
    .toBuffer();

  return result;
}

/**
 * Strip all metadata (EXIF, XMP, ICC, etc.) from an image buffer by
 * re-encoding it through sharp without `.withMetadata()`. Used when
 * watermarking is not required but we still want to scrub upstream
 * vendor identifiers (e.g. `Software: xAI Grok`) before persisting to
 * R2 / serving to clients.
 */
export async function stripImageMetadata(
  imageBuffer: Buffer | Uint8Array
): Promise<Buffer> {
  return await sharp(imageBuffer).png().toBuffer();
}
