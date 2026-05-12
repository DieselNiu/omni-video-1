/**
 * Image Generation Types
 */

import type { ImageExecutableModel } from '@/models/types';

export interface ImageProvider {
  getName(): string;
  /**
   * Submit a generation request.
   *
   * `executable` carries everything the provider needs from the registry —
   * `binding.apiModelId` is the upstream model string to send, and
   * `binding.providerOptions` holds per-provider typed knobs (kie.bodyVersion,
   * maxapi.grokTier, etc.). Providers must NOT reach back into legacy
   * `IMAGE_MODELS` / `getImageModel()` to reconstruct this.
   */
  submit(
    executable: ImageExecutableModel,
    input: ImageGenerationRequest,
    webhookUrl?: string
  ): Promise<ImageGenerationResponse>;
  /**
   * status() and result() still accept the user-facing modelId as a string
   * because they only need it for logs — they query upstream by requestId.
   */
  status?(model: string, requestId: string): Promise<ImageGenerationStatus>;
  result?(model: string, requestId: string): Promise<ImageGenerationResult>;
}

export interface ImageGenerationRequest {
  prompt: string;
  image_urls?: string[]; // For image-to-image
  /** Apimart-native ratio field (e.g. '16:9'). Takes precedence over aspect_ratio. */
  size?: string;
  /** Legacy field kept for web callers; normalised into `size` by providers. */
  aspect_ratio?: string;
  /** '1k' | '2k' | '4k' — forwarded as-is to apimart (case-normalised). */
  resolution?: string;
  output_format?: 'png' | 'jpg' | 'jpeg';
  /** Number of images (apimart currently supports 1 only). */
  n?: number;
}

export interface ImageGenerationResponse {
  request_id: string;
  status: string;
  model: string;
  record_id?: string;
  raw_response?: unknown;
}

export interface ImageGenerationStatus {
  request_id: string;
  status: string;
  progress?: number;
  error_message?: string;
  raw_data?: unknown;
}

export interface ImageGenerationResult {
  request_id: string;
  status: string;
  image_urls?: string[];
  error_message?: string;
  data?: unknown;
}

// Callback data from Nano Banana API
export interface NanoBananaCallbackData {
  code: number;
  msg: string;
  data: {
    taskId: string;
    state: 'success' | 'fail' | 'processing' | 'pending';
    model: string;
    createTime: number;
    updateTime: number;
    completeTime?: number;
    costTime?: number;
    resultJson?: string; // JSON string containing resultUrls array
    failCode?: string;
    failMsg?: string;
    param?: string;
  };
}

// Parsed result from resultJson
export interface NanoBananaResultData {
  resultUrls: string[];
}
