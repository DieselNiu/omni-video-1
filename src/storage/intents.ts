import { MAX_FILE_SIZE } from '@/lib/constants';

export type UploadIntentAuth = 'session' | 'session-or-guest';
export type UploadIntentLifecycle = 'temporary' | 'persistent';

export interface UploadIntentRateLimit {
  windowSeconds: number;
  max: number;
  /**
   * Fraction of `max` at which captcha is required. When the post-
   * increment count exceeds `Math.floor(max * captchaThreshold)`, the
   * request must present a valid captcha (or a cookie showing one was
   * solved earlier in this window) to proceed. Ignored when Turnstile
   * is disabled.
   */
  captchaThreshold: number;
}

export type UploadIntentPathScope = 'none' | 'userId';

export interface UploadIntentConfig {
  folder: string;
  auth: UploadIntentAuth;
  lifecycle: UploadIntentLifecycle;
  allowedMimeTypes: readonly string[];
  maxFileSize: number;
  rateLimit: UploadIntentRateLimit;
  pathScope: UploadIntentPathScope;
}

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const AVATAR_MAX_SIZE = 5 * 1024 * 1024;
const ONE_MINUTE = 60;

export const UPLOAD_INTENTS = {
  'image-input': {
    folder: 'uploads/images',
    auth: 'session-or-guest',
    lifecycle: 'temporary',
    allowedMimeTypes: IMAGE_MIME_TYPES,
    maxFileSize: MAX_FILE_SIZE,
    rateLimit: { windowSeconds: ONE_MINUTE, max: 30, captchaThreshold: 0.7 },
    pathScope: 'none',
  },
  'effect-input': {
    folder: 'uploads/effects',
    auth: 'session',
    lifecycle: 'temporary',
    allowedMimeTypes: IMAGE_MIME_TYPES,
    maxFileSize: MAX_FILE_SIZE,
    rateLimit: { windowSeconds: ONE_MINUTE, max: 20, captchaThreshold: 0.7 },
    pathScope: 'none',
  },
  'video-frame': {
    folder: 'uploads/video-frames',
    auth: 'session',
    lifecycle: 'temporary',
    allowedMimeTypes: IMAGE_MIME_TYPES,
    maxFileSize: MAX_FILE_SIZE,
    rateLimit: { windowSeconds: ONE_MINUTE, max: 20, captchaThreshold: 0.7 },
    pathScope: 'none',
  },
  'video-reference': {
    folder: 'uploads/video-references',
    auth: 'session',
    lifecycle: 'temporary',
    allowedMimeTypes: IMAGE_MIME_TYPES,
    maxFileSize: MAX_FILE_SIZE,
    rateLimit: { windowSeconds: ONE_MINUTE, max: 20, captchaThreshold: 0.7 },
    pathScope: 'none',
  },
  avatar: {
    folder: 'avatars',
    auth: 'session',
    lifecycle: 'persistent',
    allowedMimeTypes: IMAGE_MIME_TYPES,
    maxFileSize: AVATAR_MAX_SIZE,
    rateLimit: { windowSeconds: ONE_MINUTE, max: 5, captchaThreshold: 0.8 },
    pathScope: 'userId',
  },
  // Reference role library — persistent because we want the role to
  // outlive the current session and survive a CDN purge. User-scoped
  // path so admins can locate a user's library on the bucket.
  'role-input': {
    folder: 'uploads/roles',
    auth: 'session',
    lifecycle: 'persistent',
    allowedMimeTypes: IMAGE_MIME_TYPES,
    maxFileSize: MAX_FILE_SIZE,
    rateLimit: { windowSeconds: ONE_MINUTE, max: 10, captchaThreshold: 0.7 },
    pathScope: 'userId',
  },
} as const satisfies Record<string, UploadIntentConfig>;

export type UploadIntent = keyof typeof UPLOAD_INTENTS;

export function isUploadIntent(value: unknown): value is UploadIntent {
  return typeof value === 'string' && Object.hasOwn(UPLOAD_INTENTS, value);
}

export function getUploadIntentConfig(
  intent: UploadIntent
): UploadIntentConfig {
  return UPLOAD_INTENTS[intent];
}
