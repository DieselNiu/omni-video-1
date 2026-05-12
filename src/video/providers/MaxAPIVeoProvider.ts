/**
 * MaxAPI Veo Provider
 * Implements Veo 3.1 video generation via MaxAPI backend
 */

import type {
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoGenerationResult,
  VideoGenerationStatus,
  VideoProvider,
} from '../types';
import { MaxApiClient } from './MaxApiClient';

/**
 * Model ID mapping
 * Maps frontend model IDs to MaxAPI model names
 */
const MODEL_ID_MAP: Record<string, string> = {
  'veo3-text-to-video': 'veo3',
  'veo3-image-to-video': 'veo3',
};

/**
 * MaxAPI Veo Provider
 * Supports T2V, I2V, I2V-FL (first+last frame), and R2V (reference images) modes
 *
 * Mode selection is automatic based on imageUrls count:
 * - 0 images: T2V (text-to-video)
 * - 1 image: I2V (image-to-video, first frame)
 * - 2 images: I2V-FL (first + last frame)
 * - 3 images: R2V (reference-to-video)
 */
export class MaxAPIVeoProvider implements VideoProvider {
  private readonly client: MaxApiClient;

  constructor(apiKey: string) {
    this.client = new MaxApiClient(apiKey, '[MaxAPI-Veo]');
  }

  getName(): string {
    return 'maxapi-veo';
  }

  /**
   * Map frontend model ID to MaxAPI model name
   */
  private mapModelId(model: string): string {
    return MODEL_ID_MAP[model] || 'veo3';
  }

  /**
   * Map aspect ratio to MaxAPI ratio format
   * Supports: 16:9 (landscape), 9:16 (portrait)
   */
  private mapAspectRatio(aspectRatio?: string): string {
    if (!aspectRatio) return '16:9';

    const normalized = aspectRatio.toLowerCase().trim();

    if (normalized.includes('16:9') || normalized === 'landscape')
      return '16:9';
    if (normalized.includes('9:16') || normalized === 'portrait') return '9:16';

    // Default to landscape
    return '16:9';
  }

  /**
   * Submit video generation task
   *
   * Mode is automatically determined by imageUrls count:
   * - 0 images: T2V
   * - 1 image: I2V (first frame)
   * - 2 images: I2V-FL (first + last frame)
   * - 3 images: R2V (reference images)
   */
  async submit(
    model: string,
    input: VideoGenerationRequest,
    webhookUrl?: string
  ): Promise<VideoGenerationResponse> {
    // Normalize image URLs
    const imageUrls =
      input.image_urls || (input.image_url ? [input.image_url] : []);
    const aspectRatio = input.aspect_ratio || input.aspectRatio;

    // Determine mode based on image count
    let mode: string;
    if (imageUrls.length === 0) {
      mode = 'T2V';
    } else if (imageUrls.length === 1) {
      mode = 'I2V';
    } else if (imageUrls.length === 2) {
      mode = 'I2V-FL';
    } else if (imageUrls.length === 3) {
      mode = 'R2V';
    } else {
      throw new Error(
        `Invalid number of images: ${imageUrls.length}. Veo 3 supports 0-3 images.`
      );
    }

    console.log(
      `[MaxAPI-Veo] Starting ${mode} generation with ${imageUrls.length} images`
    );

    // Build input object
    const inputObj: Record<string, unknown> = {
      prompt: input.prompt,
    };

    // Add images if provided
    if (imageUrls.length > 0) {
      inputObj.imageUrls = imageUrls;
    }

    // Add ratio for T2V mode (I2V modes inherit from image dimensions)
    if (imageUrls.length === 0 && aspectRatio) {
      const ratio = this.mapAspectRatio(aspectRatio);
      inputObj.ratio = ratio;
    }

    // Build request body
    const requestBody: Record<string, unknown> = {
      model: this.mapModelId(model),
      input: inputObj,
    };

    if (webhookUrl) {
      requestBody.callBackUrl = webhookUrl;
    }

    console.log(
      '[MaxAPI-Veo] Request body:',
      JSON.stringify(requestBody, null, 2)
    );

    const response = (await this.client.makeRequest(
      '/api/v1/task/submit',
      'POST',
      requestBody
    )) as {
      code: number;
      msg?: string;
      data?: { taskId?: string };
    };

    console.log(
      '[MaxAPI-Veo] Submit response:',
      JSON.stringify(response, null, 2)
    );

    if (response.code !== 0) {
      throw new Error(response.msg || 'MaxAPI task submission failed');
    }

    if (!response.data?.taskId) {
      throw new Error('No taskId received from MaxAPI');
    }

    return {
      request_id: response.data.taskId,
      status: 'IN_QUEUE',
      model,
      task_id: response.data.taskId,
      raw_response: response,
    };
  }

  async status(
    _model: string,
    requestId: string
  ): Promise<VideoGenerationStatus> {
    return this.client.checkStatus(requestId);
  }

  async result(
    _model: string,
    requestId: string
  ): Promise<VideoGenerationResult> {
    return this.client.getResult(requestId);
  }
}
