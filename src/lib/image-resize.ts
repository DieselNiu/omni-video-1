/**
 * Seedance 2.0 series accepts images only within a fixed aspect-ratio
 * window (0.4–2.5) and pixel range (300–6000 px on either side).
 * Submitting a file outside this window costs the user credits — the
 * upstream errors out *after* we've already deducted. Run this
 * validator before kicking off the upload so we can toast a clean
 * message and skip the file.
 */
export interface SeedanceImageCheck {
  valid: boolean;
  reason?: 'ratio' | 'dimensions' | 'decode';
  width?: number;
  height?: number;
}

const MIN_PX = 300;
const MAX_PX = 6000;
const MIN_RATIO = 0.4;
const MAX_RATIO = 2.5;

export async function validateSeedanceImage(
  file: File
): Promise<SeedanceImageCheck> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { valid: false, reason: 'decode' };
  }
  const { width, height } = bitmap;
  bitmap.close();

  if (width < MIN_PX || height < MIN_PX || width > MAX_PX || height > MAX_PX) {
    return { valid: false, reason: 'dimensions', width, height };
  }
  const ratio = width / height;
  if (ratio < MIN_RATIO || ratio > MAX_RATIO) {
    return { valid: false, reason: 'ratio', width, height };
  }
  return { valid: true, width, height };
}

/**
 * Seedance 2.0 reference video constraints (per BytePlus Ark docs).
 * Mirrors `validateSeedanceImage` so we can reject bad video uploads
 * before they cost the user credits at submit time.
 *
 * Note: encoding (H.264/H.265) and FPS are not validated — the browser
 * doesn't expose them cheaply. We let the upstream API reject those.
 */
export interface SeedanceVideoCheck {
  valid: boolean;
  reason?: 'ratio' | 'dimensions' | 'total-pixels' | 'decode';
  width?: number;
  height?: number;
}

const VIDEO_MIN_PX = 300;
const VIDEO_MAX_PX = 6000;
const VIDEO_MIN_RATIO = 0.4;
const VIDEO_MAX_RATIO = 2.5;
const VIDEO_MIN_TOTAL_PX = 640 * 640; // 409600
const VIDEO_MAX_TOTAL_PX = 2206 * 946; // 2086876

export async function validateSeedanceVideo(
  file: File
): Promise<SeedanceVideoCheck> {
  const url = URL.createObjectURL(file);
  try {
    const { width, height } = await new Promise<{
      width: number;
      height: number;
    }>((resolve, reject) => {
      const el = document.createElement('video');
      el.preload = 'metadata';
      el.src = url;
      el.onloadedmetadata = () => {
        const w = el.videoWidth;
        const h = el.videoHeight;
        if (w > 0 && h > 0) resolve({ width: w, height: h });
        else reject(new Error('no-dimensions'));
      };
      el.onerror = () => reject(new Error('decode'));
    });

    if (
      width < VIDEO_MIN_PX ||
      height < VIDEO_MIN_PX ||
      width > VIDEO_MAX_PX ||
      height > VIDEO_MAX_PX
    ) {
      return { valid: false, reason: 'dimensions', width, height };
    }
    const ratio = width / height;
    if (ratio < VIDEO_MIN_RATIO || ratio > VIDEO_MAX_RATIO) {
      return { valid: false, reason: 'ratio', width, height };
    }
    const total = width * height;
    if (total < VIDEO_MIN_TOTAL_PX || total > VIDEO_MAX_TOTAL_PX) {
      return { valid: false, reason: 'total-pixels', width, height };
    }
    return { valid: true, width, height };
  } catch {
    return { valid: false, reason: 'decode' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface WanReferenceMediaCheck {
  valid: boolean;
  reason?: 'ratio' | 'dimensions' | 'decode';
  width?: number;
  height?: number;
}

/**
 * Wan 2.7 reference media constraints:
 * - reference_image: 240-8000px per side, aspect ratio 1:8-8:1.
 * - reference_video: 240-4096px per side, aspect ratio 1:8-8:1.
 *
 * File size, duration, count, and voice/reference pairing are checked
 * in the upload component where bucket state is available.
 */
const WAN_IMAGE_MIN_PX = 240;
const WAN_IMAGE_MAX_PX = 8000;
const WAN_VIDEO_MIN_PX = 240;
const WAN_VIDEO_MAX_PX = 4096;
const WAN_MIN_RATIO = 1 / 8;
const WAN_MAX_RATIO = 8;

export async function validateWanReferenceImage(
  file: File
): Promise<WanReferenceMediaCheck> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { valid: false, reason: 'decode' };
  }
  const { width, height } = bitmap;
  bitmap.close();

  if (
    width < WAN_IMAGE_MIN_PX ||
    height < WAN_IMAGE_MIN_PX ||
    width > WAN_IMAGE_MAX_PX ||
    height > WAN_IMAGE_MAX_PX
  ) {
    return { valid: false, reason: 'dimensions', width, height };
  }
  const ratio = width / height;
  if (ratio < WAN_MIN_RATIO || ratio > WAN_MAX_RATIO) {
    return { valid: false, reason: 'ratio', width, height };
  }
  return { valid: true, width, height };
}

export async function validateWanReferenceVideo(
  file: File
): Promise<WanReferenceMediaCheck> {
  const url = URL.createObjectURL(file);
  try {
    const { width, height } = await new Promise<{
      width: number;
      height: number;
    }>((resolve, reject) => {
      const el = document.createElement('video');
      el.preload = 'metadata';
      el.src = url;
      el.onloadedmetadata = () => {
        const w = el.videoWidth;
        const h = el.videoHeight;
        if (w > 0 && h > 0) resolve({ width: w, height: h });
        else reject(new Error('no-dimensions'));
      };
      el.onerror = () => reject(new Error('decode'));
    });

    if (
      width < WAN_VIDEO_MIN_PX ||
      height < WAN_VIDEO_MIN_PX ||
      width > WAN_VIDEO_MAX_PX ||
      height > WAN_VIDEO_MAX_PX
    ) {
      return { valid: false, reason: 'dimensions', width, height };
    }
    const ratio = width / height;
    if (ratio < WAN_MIN_RATIO || ratio > WAN_MAX_RATIO) {
      return { valid: false, reason: 'ratio', width, height };
    }
    return { valid: true, width, height };
  } catch {
    return { valid: false, reason: 'decode' };
  } finally {
    URL.revokeObjectURL(url);
  }
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
