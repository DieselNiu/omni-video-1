// Public-facing error category. Routes upstream provider errors into a
// fixed taxonomy the client can localize / branch on; the original
// message stays in the server log.
//
// Adding a new category is a deliberate act — every category needs a
// canonical client-safe template. Anything that does not match one of
// the categories falls back to GENERIC.
export type ProviderErrorCategory =
  | 'network'
  | 'rate_limited'
  | 'invalid_input'
  | 'timeout'
  | 'unauthorized'
  | 'server_error'
  | 'generic';

interface ClassifiedError {
  category: ProviderErrorCategory;
  /** Optional HTTP status code surfaced for client-side retry/UX. */
  httpStatus: number | null;
}

const GENERIC_FALLBACK = 'Image generation failed. Please try again.';

const CATEGORY_TEMPLATES: Record<ProviderErrorCategory, string> = {
  network: 'Network error reaching the image service. Please try again.',
  timeout: 'Image generation timed out. Please try again.',
  rate_limited:
    'Too many requests right now. Please wait a moment and try again.',
  invalid_input:
    'The request was rejected by the image service. Please adjust your prompt or settings and try again.',
  unauthorized:
    'The image service rejected the request credentials. Please contact support.',
  server_error: 'The image service is temporarily unavailable. Please retry.',
  generic: GENERIC_FALLBACK,
};

// Whitelist classification: match each category by stable signal
// (HTTP status / error name / known transport phrase). Vendor-name
// strings are deliberately NOT used as signals — they identify the
// real backend, which is the leak we're sanitizing.
function classify(raw: string): ClassifiedError {
  const lower = raw.toLowerCase();
  const statusMatch = raw.match(/\b([45]\d{2})\b/);
  const httpStatus = statusMatch ? Number(statusMatch[1]) : null;

  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('etimedout')
  ) {
    return { category: 'timeout', httpStatus };
  }
  if (
    lower.includes('econnreset') ||
    lower.includes('econnrefused') ||
    lower.includes('socket') ||
    /\bnetwork( error)?\b/.test(lower) ||
    lower.includes('fetch failed')
  ) {
    return { category: 'network', httpStatus };
  }
  if (httpStatus === 429 || lower.includes('rate limit')) {
    return { category: 'rate_limited', httpStatus };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return { category: 'unauthorized', httpStatus };
  }
  if (httpStatus !== null && httpStatus >= 400 && httpStatus < 500) {
    return { category: 'invalid_input', httpStatus };
  }
  if (httpStatus !== null && httpStatus >= 500) {
    return { category: 'server_error', httpStatus };
  }
  return { category: 'generic', httpStatus };
}

/**
 * Map a raw provider error message to a sanitized, client-safe string.
 *
 * Implementation: classify the error into a fixed category by stable
 * signals (HTTP status, well-known transport phrases) and render from a
 * canonical template. Vendor identifiers ("MaxAPI", "Apimart", "Kie",
 * "Grok", ...) never appear in the output by construction — even if a
 * future vendor's error format wasn't anticipated, the template-based
 * approach can't echo their name.
 *
 * The original message stays in DB / server logs (caller's
 * responsibility) for ops debugging.
 */
export function sanitizeProviderErrorMessage(
  raw: string | null | undefined
): string {
  if (!raw) return GENERIC_FALLBACK;
  const { category, httpStatus } = classify(raw);
  const template = CATEGORY_TEMPLATES[category];
  if (
    httpStatus &&
    (category === 'invalid_input' || category === 'server_error')
  ) {
    return `${template} (code ${httpStatus})`;
  }
  return template;
}

/**
 * Exported for callers (e.g. analytics/UX branching) that want the
 * machine-readable category alongside the rendered message.
 */
export function classifyProviderErrorPublic(
  raw: string | null | undefined
): ProviderErrorCategory {
  if (!raw) return 'generic';
  return classify(raw).category;
}
