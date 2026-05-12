import { websiteConfig } from '@/config/website';

// Canonical id for the home flow. Pulled from
// `generation.surfaces['home-anonymous'].defaultModel` so swapping the
// homepage model is a one-line config change. All NEW rows write this
// id to asset.model_id / guest_generation.model_id. The legacy
// `nano-banana-pro` id still works for incoming API payloads (see
// validation.ts) and shows up on historical rows.
export const HOME_IMAGE_ALLOWED_MODEL_ID =
  websiteConfig.generation.surfaces['home-anonymous'].defaultModel;
export const HOME_IMAGE_PUBLIC_MODEL_ID = HOME_IMAGE_ALLOWED_MODEL_ID;
export const HOME_IMAGE_ALLOWED_MODEL_IDS =
  websiteConfig.generation.surfaces['home-anonymous'].allowedModels;

/**
 * Translate historical `model_id` values to the current public id.
 *
 * Pre-cutover rows were written with `model_id='nano-banana-pro'` while the
 * frontend label was already "GPT Image 2". Post-cutover rows are written as
 * `gpt-image-2` directly. This helper normalizes history-feed responses so
 * the picker and recent-list UI see a single canonical product id regardless
 * of when the row was created.
 */
export function toPublicHomeModelId<T extends string | null | undefined>(
  modelId: T
): T | typeof HOME_IMAGE_PUBLIC_MODEL_ID {
  if (modelId === 'nano-banana-pro') {
    return HOME_IMAGE_PUBLIC_MODEL_ID;
  }
  return modelId;
}
export const HOME_IMAGE_DEFAULT_ASPECT_RATIO = '1:1';
export const HOME_IMAGE_DEFAULT_OUTPUT_FORMAT = 'png';
export const HOME_IMAGE_CACHE_CONTROL = 'no-store';
export const HOME_IMAGE_IDEMPOTENCY_STATUS = {
  PENDING: 'pending',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
} as const;
export const HOME_IMAGE_GENERATION_KIND = {
  ASSET: 'asset',
  GUEST_GENERATION: 'guest_generation',
} as const;
export const HOME_IMAGE_ERROR = {
  INVALID_PARAMS: 'INVALID_PARAMS',
  FEATURE_REQUIRES_LOGIN: 'FEATURE_REQUIRES_LOGIN',
  GUEST_COOKIE_MISSING: 'GUEST_COOKIE_MISSING',
  CONCURRENT_LIMIT: 'CONCURRENT_LIMIT',
  PAID_USER_NO_CREDITS: 'PAID_USER_NO_CREDITS',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD:
    'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
  REQUEST_IN_PROGRESS: 'REQUEST_IN_PROGRESS',
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  /** Model id is not in this surface's allowedModels whitelist.
   *  Distinct from FEATURE_REQUIRES_LOGIN (auth gate) and
   *  INVALID_PARAMS (malformed body) so the client can route to a
   *  more specific UX (refresh hint) without cross-contaminating
   *  other failure modes. */
  MODEL_NOT_AVAILABLE_ON_SURFACE: 'MODEL_NOT_AVAILABLE_ON_SURFACE',
} as const;
export const HOME_IMAGE_IN_PROGRESS_STATUSES = [
  'PENDING',
  'IN_QUEUE',
  'IN_PROGRESS',
  'PROCESSING',
] as const;
export const HOME_IMAGE_PROVIDER_PENDING_STATUS = 'PROCESSING';
export const HOME_IMAGE_PROVIDER_INITIAL_STATUS = 'PENDING';
