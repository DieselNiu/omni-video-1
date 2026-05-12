/**
 * MaxAPI Nano Banana Image Generation Provider
 * Integrates with MaxAPI for Nano Banana image generation using async task pattern.
 */

import type { ImageExecutableModel } from '@/models/types';
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageGenerationResult,
  ImageGenerationStatus,
  ImageProvider,
} from '../types';
import { MaxapiClient } from './maxapi-client';

const LOG_TAG = 'MaxAPI-NanoBanana';

export class MaxAPINanoBananaProvider implements ImageProvider {
  private readonly client: MaxapiClient;

  constructor(apiKey: string) {
    this.client = new MaxapiClient(apiKey, LOG_TAG);
  }

  getName(): string {
    return 'maxapi-nano-banana';
  }

  private mapAspectRatio(aspectRatio?: string): string {
    if (!aspectRatio) return '16:9';
    const normalized = aspectRatio.toLowerCase().trim();
    if (normalized.includes('16:9') || normalized === 'landscape')
      return '16:9';
    if (normalized.includes('9:16') || normalized === 'portrait') return '9:16';
    if (normalized.includes('1:1') || normalized === 'square') return '1:1';
    if (normalized.includes('4:3')) return '4:3';
    if (normalized.includes('3:4')) return '3:4';
    return '16:9';
  }

  private mapResolution(resolution?: string): string | undefined {
    if (!resolution) return undefined;
    const normalized = resolution.toUpperCase().trim();
    if (normalized === '2K') return '2k';
    if (normalized === '4K') return '4k';
    if (normalized === '1K') return '1k';
    return undefined;
  }

  async submit(
    executable: ImageExecutableModel,
    input: ImageGenerationRequest,
    webhookUrl?: string
  ): Promise<ImageGenerationResponse> {
    const imageUrls = input.image_urls || [];
    const hasImages = imageUrls.length > 0;

    console.log(
      `[${LOG_TAG}] Starting ${hasImages ? 'image-to-image' : 'text-to-image'} generation (executable=${executable.id} -> ${executable.binding.apiModelId})`
    );

    let processedImageUrls: string[] | undefined;
    if (hasImages) {
      processedImageUrls = await Promise.all(
        imageUrls.map((url) => this.client.convertBase64ToUrl(url))
      );
    }

    const inputObj: Record<string, unknown> = { prompt: input.prompt };

    if (processedImageUrls && processedImageUrls.length > 0) {
      inputObj.imageUrls = processedImageUrls;
    }

    const ratio = this.mapAspectRatio(input.aspect_ratio);
    if (ratio) inputObj.ratio = ratio;

    const resolution = this.mapResolution(input.resolution);
    if (resolution) inputObj.resolution = resolution;

    const requestBody: Record<string, unknown> = {
      // Trust the binding: executable.binding.apiModelId is the upstream
      // MaxAPI model name (e.g. 'nano-banana', 'nano-banana-pro', 'nano-banana-2').
      model: executable.binding.apiModelId,
      input: inputObj,
    };
    if (webhookUrl) requestBody.callBackUrl = webhookUrl;

    const taskId = await this.client.submitTask(requestBody);

    return {
      request_id: taskId,
      status: 'IN_QUEUE',
      model: executable.id,
    };
  }

  async status(
    _model: string,
    requestId: string
  ): Promise<ImageGenerationStatus> {
    return this.client.queryStatus(requestId);
  }

  async result(
    _model: string,
    requestId: string
  ): Promise<ImageGenerationResult> {
    return this.client.queryResult(requestId);
  }
}
