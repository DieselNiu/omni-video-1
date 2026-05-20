/**
 * sd2_manxue accepts images only within a fixed aspect-ratio window
 * (0.4–2.5) and pixel range (300–6000 px on either side). Submitting a
 * file outside this window costs the user credits — the upstream errors
 * out *after* we've already deducted. Run this validator before kicking
 * off the upload so we can toast a clean message and skip the file.
 */
export interface Sd2ManxueImageCheck {
  valid: boolean;
  reason?: 'ratio' | 'dimensions' | 'decode';
  width?: number;
  height?: number;
}

const SD2_MIN_PX = 300;
const SD2_MAX_PX = 6000;
const SD2_MIN_RATIO = 0.4;
const SD2_MAX_RATIO = 2.5;

export async function validateSd2ManxueImage(
  file: File
): Promise<Sd2ManxueImageCheck> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { valid: false, reason: 'decode' };
  }
  const { width, height } = bitmap;
  bitmap.close();

  if (
    width < SD2_MIN_PX ||
    height < SD2_MIN_PX ||
    width > SD2_MAX_PX ||
    height > SD2_MAX_PX
  ) {
    return { valid: false, reason: 'dimensions', width, height };
  }
  const ratio = width / height;
  if (ratio < SD2_MIN_RATIO || ratio > SD2_MAX_RATIO) {
    return { valid: false, reason: 'ratio', width, height };
  }
  return { valid: true, width, height };
}

/**
 * Downscale a user-supplied image to a fixed-size square thumbnail using
 * a canvas. Crop is center-cover (matches the avatar circle in the band)
 * so faces stay centred. Returns a new webp File ready to upload.
 *
 * Reads the source via createImageBitmap when available — that path
 * avoids the rasterise-and-blit overhead of <img> + onload and works
 * with the off-thread image decode.
 */
export async function makeSquareThumbnail(
  source: File,
  size = 128,
  quality = 0.85
): Promise<File> {
  const bitmap = await createImageBitmap(source);
  const { width: sw, height: sh } = bitmap;
  const side = Math.min(sw, sh);
  const sx = (sw - side) / 2;
  const sy = (sh - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Thumbnail encode failed'))),
      'image/webp',
      quality
    )
  );
  const base = source.name.replace(/\.[^.]+$/, '') || 'thumb';
  return new File([blob], `${base}-thumb.webp`, { type: 'image/webp' });
}
