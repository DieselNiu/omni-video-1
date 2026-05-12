/**
 * MaxAPI Grok Imagine Image Generation Provider
 * Routes the frontend's nano-banana-* model IDs to xAI Grok Imagine via MaxAPI.
 *
 * Frontend UI is unchanged; unsupported options degrade silently:
 * - aspect ratio: 4:3 -> 16:9, 3:4 -> 9:16 (Grok only supports 1:1 / 16:9 / 9:16)
 * - resolution:  1K -> 720p, 2K/4K -> 1080p (Grok exposes 720p / 1080p)
 * - i2i references capped at 2 (upstream limit)
 * - i2i and lite tier lock output to 1024x1024 and reject ratio/resolution
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

type GrokTier = 'lite' | 'standard' | 'pro';

/**
 * Determine Grok tier from the executable's typed providerOptions.
 */
function resolveGrokTier(executable: ImageExecutableModel): GrokTier {
  if (executable.binding.provider === 'maxapi') {
    const opts = executable.binding.providerOptions;
    if (opts?.grokTier) return opts.grokTier;
  }
  return 'lite';
}

const LOG_TAG = 'MaxAPI-Grok';

export class MaxAPIGrokProvider implements ImageProvider {
  private readonly client: MaxapiClient;

  constructor(apiKey: string) {
    this.client = new MaxapiClient(apiKey, LOG_TAG);
  }

  getName(): string {
    return 'maxapi-grok';
  }

  private pickUpstreamModel(hasImages: boolean, tier: GrokTier): string {
    return hasImages
      ? 'grok-imagine/image-to-image'
      : `grok-imagine/text-to-image-${tier}`;
  }

  private mapAspectRatio(aspectRatio?: string): string {
    if (!aspectRatio) return '16:9';
    const normalized = aspectRatio.toLowerCase().trim();
    if (normalized.includes('16:9') || normalized === 'landscape')
      return '16:9';
    if (normalized.includes('9:16') || normalized === 'portrait') return '9:16';
    if (normalized.includes('1:1') || normalized === 'square') return '1:1';
    // Silent degrade: Grok does not support 4:3 or 3:4.
    if (normalized.includes('4:3')) return '16:9';
    if (normalized.includes('3:4')) return '9:16';
    return '16:9';
  }

  private mapResolution(resolution?: string): string | undefined {
    if (!resolution) return undefined;
    const normalized = resolution.toUpperCase().trim();
    if (normalized === '1K') return '720p';
    if (normalized === '2K' || normalized === '4K') return '1080p';
    return undefined;
  }

  async submit(
    executable: ImageExecutableModel,
    input: ImageGenerationRequest,
    webhookUrl?: string
  ): Promise<ImageGenerationResponse> {
    const imageUrls = input.image_urls || [];
    const hasImages = imageUrls.length > 0;
    const tier = resolveGrokTier(executable);

    console.log(
      `[${LOG_TAG}] Starting ${hasImages ? 'image-to-image' : `text-to-image-${tier}`} generation (executable=${executable.id})`
    );

    // Grok i2i accepts at most 2 reference images.
    let processedImageUrls: string[] | undefined;
    if (hasImages) {
      processedImageUrls = await Promise.all(
        imageUrls.slice(0, 2).map((url) => this.client.convertBase64ToUrl(url))
      );
    }

    const inputObj: Record<string, unknown> = { prompt: input.prompt };

    if (processedImageUrls && processedImageUrls.length > 0) {
      inputObj.imageUrls = processedImageUrls;
    }

    // i2i and lite tier lock output to 1024x1024; upstream rejects ratio/resolution.
    const locksOutput = hasImages || tier === 'lite';
    if (!locksOutput) {
      const ratio = this.mapAspectRatio(input.aspect_ratio);
      if (ratio) inputObj.ratio = ratio;

      const resolution = this.mapResolution(input.resolution);
      if (resolution) inputObj.resolution = resolution;
    }

    const upstreamModel = this.pickUpstreamModel(hasImages, tier);
    const requestBody: Record<string, unknown> = {
      model: upstreamModel,
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
