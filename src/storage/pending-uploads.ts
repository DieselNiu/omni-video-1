/**
 * In-flight browser→R2 upload registry, keyed by image id.
 *
 * This powers "optimistic upload": the user can hit Generate the instant
 * they pick a reference image, without waiting for the upload spinner to
 * clear. The upload components register each upload's promise here while
 * it flies in the background; the submit handlers call
 * {@link resolveUploadedUrls} to await only the relevant uploads and read
 * their final R2 URLs right before building the generation payload.
 *
 * In the common case the upload has already finished by the time the user
 * stops typing their prompt and clicks Generate, so resolution is
 * instant — but if they click early, we wait exactly as long as the upload
 * needs instead of blocking the button up front.
 */

const pending = new Map<string, Promise<string | null>>();

/**
 * Track an in-flight upload. The promise must resolve to the final R2 URL
 * (or `null` if the upload failed). Entries auto-clear once settled so the
 * map never grows unbounded.
 */
export function registerUpload(
  id: string,
  promise: Promise<string | null>
): void {
  pending.set(id, promise);
  promise.finally(() => {
    // Only delete if we're still the current promise for this id — a
    // re-upload under the same id (shouldn't happen, ids are uuids) would
    // otherwise be clobbered.
    if (pending.get(id) === promise) pending.delete(id);
  });
}

/** Minimal shape {@link resolveUploadedUrls} needs — matches UploadedImage. */
interface ResolvableImage {
  id: string;
  r2Url?: string;
  error?: string;
}

/**
 * Resolve a list of upload records to their final R2 URLs, awaiting any
 * still-in-flight uploads. Already-uploaded records (r2Url present, e.g.
 * picked from history) resolve instantly; failed uploads are dropped.
 * Order is preserved.
 */
export async function resolveUploadedUrls(
  images: ResolvableImage[]
): Promise<string[]> {
  const urls = await Promise.all(
    images.map(async (img) => {
      if (img.error) return null;
      if (img.r2Url) return img.r2Url;
      const inFlight = pending.get(img.id);
      if (inFlight) return await inFlight;
      return null;
    })
  );
  return urls.filter((u): u is string => Boolean(u));
}
