// PixVerse API Configuration
// Centralized configuration for all PixVerse-related code

export const PIXVERSE_CONFIG = {
  // API Base URL
  API_BASE: 'https://app-api.pixverse.ai/openapi/v2',

  // Endpoints
  ENDPOINTS: {
    IMAGE_UPLOAD: '/image/upload',
    VIDEO_GENERATE: '/video/img/generate',
    VIDEO_RESULT: '/video/result',
  },

  // Default parameters
  DEFAULTS: {
    DURATION: 5,
    QUALITY: '540p' as const,
    MODEL: 'v4.5',
    MOTION_MODE: 'normal' as const,
  },

  // Supported quality options
  QUALITY_OPTIONS: ['360p', '540p', '720p', '1080p'] as const,

  // Generate trace ID for API requests
  generateTraceId: (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
} as const;

export type PixVerseQuality = (typeof PIXVERSE_CONFIG.QUALITY_OPTIONS)[number];
