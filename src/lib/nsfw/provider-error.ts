/**
 * Detects whether an upstream provider error message corresponds to a content
 * moderation rejection.
 *
 * Each provider returns its own error string for moderation failures (we've
 * seen "content rejected by moderation", "image flagged by safety system",
 * "violates content policy", etc.). Rather than enumerating every provider,
 * we look for a small set of well-known phrases. False negatives just fall
 * through to the existing generic-failure path; there are no false positives
 * we care about — saying "this looks like NSFW" when it isn't is at worst a
 * misleading toast.
 *
 * The phrase list is intentionally lowercased and substring-matched.
 */
const MODERATION_PHRASES = [
  'content rejected by moderation',
  'content rejected',
  'rejected by moderation',
  'content moderation',
  'moderation policy',
  'content policy',
  'safety system',
  'safety filter',
  'flagged',
  'nsfw',
  'sexual content',
  'explicit content',
  'inappropriate content',
];

export function isProviderModerationError(message: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return MODERATION_PHRASES.some((phrase) => lower.includes(phrase));
}
