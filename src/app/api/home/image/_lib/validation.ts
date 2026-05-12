import {
  HOME_IMAGE_ALLOWED_MODEL_ID,
  HOME_IMAGE_ALLOWED_MODEL_IDS,
  HOME_IMAGE_DEFAULT_ASPECT_RATIO,
  HOME_IMAGE_DEFAULT_OUTPUT_FORMAT,
  HOME_IMAGE_ERROR,
} from './constants';

// Accept any product id whitelisted on the home-anonymous surface, plus
// the legacy 'nano-banana-pro' alias for back-compat (bookmarks, stale
// clients, external integrations). Anything outside the surface allow-
// list is rejected — a video product, a paid-tier model, or a freshly
// minted ProductModel without an explicit opt-in cannot be submitted
// from the homepage even if a curious caller sends its id.
const ACCEPTED_HOME_MODEL_IDS: ReadonlySet<string> = new Set<string>([
  ...HOME_IMAGE_ALLOWED_MODEL_IDS,
  'nano-banana-pro',
]);

export interface HomeSubmitPayload {
  prompt?: unknown;
  modelId?: unknown;
  aspectRatio?: unknown;
  resolution?: unknown;
  outputFormat?: unknown;
  visitorId?: unknown;
  imageUrls?: unknown;
  inputImageUrls?: unknown;
  mode?: unknown;
  captchaToken?: unknown;
}

export interface ValidatedHomeSubmitPayload {
  prompt: string;
  /** Always normalized to the surface's `defaultModel` after validation —
   *  legacy aliases collapse to it and the surface enforces a closed set. */
  modelId: string;
  mode: 'text-to-image' | 'image-to-image';
  imageUrls: string[];
  aspectRatio: string;
  resolution: string | undefined;
  outputFormat: string;
  visitorId: string | null;
  captchaToken: string | null;
}

interface ValidationFailure {
  ok: false;
  statusCode: number;
  body: {
    error: string;
    message?: string;
  };
}

interface ValidationSuccess {
  ok: true;
  value: ValidatedHomeSubmitPayload;
}

export type HomeSubmitValidationResult = ValidationSuccess | ValidationFailure;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasInputImages(payload: HomeSubmitPayload) {
  return (
    (Array.isArray(payload.imageUrls) && payload.imageUrls.length > 0) ||
    (Array.isArray(payload.inputImageUrls) && payload.inputImageUrls.length > 0)
  );
}

function normalizeImageUrls(payload: HomeSubmitPayload) {
  const rawUrls = Array.isArray(payload.imageUrls)
    ? payload.imageUrls
    : Array.isArray(payload.inputImageUrls)
      ? payload.inputImageUrls
      : [];

  return rawUrls.filter(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0
  );
}

export function validateHomeSubmitPayload(
  payload: HomeSubmitPayload,
  options: { isAuthenticated: boolean }
): HomeSubmitValidationResult {
  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      statusCode: 400,
      body: {
        error: HOME_IMAGE_ERROR.INVALID_PARAMS,
        message: 'Request body must be a JSON object.',
      },
    };
  }

  if (
    typeof payload.modelId !== 'string' ||
    !ACCEPTED_HOME_MODEL_IDS.has(payload.modelId)
  ) {
    return {
      ok: false,
      statusCode: options.isAuthenticated ? 400 : 403,
      body: {
        error: options.isAuthenticated
          ? HOME_IMAGE_ERROR.INVALID_PARAMS
          : HOME_IMAGE_ERROR.FEATURE_REQUIRES_LOGIN,
        message: 'Only GPT Image 2 is available on the homepage.',
      },
    };
  }

  const mode =
    payload.mode === 'image-to-image' || hasInputImages(payload)
      ? 'image-to-image'
      : 'text-to-image';
  const imageUrls = normalizeImageUrls(payload);

  if (mode === 'image-to-image' && imageUrls.length === 0) {
    return {
      ok: false,
      statusCode: 400,
      body: {
        error: HOME_IMAGE_ERROR.INVALID_PARAMS,
        message: 'imageUrls are required for image-to-image generation.',
      },
    };
  }

  if (!isNonEmptyString(payload.prompt)) {
    return {
      ok: false,
      statusCode: 400,
      body: {
        error: HOME_IMAGE_ERROR.INVALID_PARAMS,
        message: 'prompt is required.',
      },
    };
  }

  const prompt = payload.prompt.trim();
  const aspectRatio =
    typeof payload.aspectRatio === 'string' && payload.aspectRatio.trim()
      ? payload.aspectRatio.trim()
      : HOME_IMAGE_DEFAULT_ASPECT_RATIO;
  const resolution =
    typeof payload.resolution === 'string' && payload.resolution.trim()
      ? payload.resolution.trim()
      : undefined;
  const outputFormat =
    typeof payload.outputFormat === 'string' && payload.outputFormat.trim()
      ? payload.outputFormat.trim()
      : HOME_IMAGE_DEFAULT_OUTPUT_FORMAT;
  const visitorId =
    typeof payload.visitorId === 'string' && payload.visitorId.trim()
      ? payload.visitorId.trim().slice(0, 512)
      : null;
  const captchaToken =
    typeof payload.captchaToken === 'string' && payload.captchaToken.trim()
      ? payload.captchaToken.trim().slice(0, 2048)
      : null;

  return {
    ok: true,
    value: {
      prompt,
      modelId: HOME_IMAGE_ALLOWED_MODEL_ID,
      mode,
      imageUrls,
      aspectRatio,
      resolution,
      outputFormat,
      visitorId,
      captchaToken,
    },
  };
}
