// Server-side URL picker: clients only ever see one URL per asset, so a
// DevTools-savvy user can't read the upstream provider domain off a
// "fallback" field. Prefer R2 (our own domain) when populated; if R2 is
// empty (upload still pending or failed), expose the upstream URL so
// the UI keeps rendering. The chosen URL is always returned in the
// `imageUrlsR2` / `outputImageUrlsR2` slot — the public field —
// regardless of whether it physically came from R2 or upstream. The
// raw upstream-only field (`imageUrls` / `outputImageUrls`) is never
// returned to clients.
export function pickPublicImageUrls(
  r2Urls: string[] | null | undefined,
  upstreamUrls: string[] | null | undefined
): string[] {
  if (r2Urls && r2Urls.length > 0) return r2Urls;
  return upstreamUrls ?? [];
}

export function pickPublicVideoUrl(
  r2Url: string | null | undefined,
  upstreamUrl: string | null | undefined
): string | null {
  return r2Url ?? upstreamUrl ?? null;
}
