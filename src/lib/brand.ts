export function getWatermarkText(): string {
  return 'geminiomni.video';
}

export function getBrandSlug(): string {
  const normalized = getWatermarkText()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'geminiomni-video';
}
