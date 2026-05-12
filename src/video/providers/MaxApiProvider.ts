/**
 * MaxAPI Provider for Seedance models
 * Implements Seedance 2.0 video generation via MaxAPI backend
 */

import type {
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoGenerationResult,
  VideoGenerationStatus,
  VideoProvider,
} from '../types';
import { MaxApiClient } from './MaxApiClient';

// Seedance 1.0 models are served by the 2.0 engine on MaxAPI
const MODEL_ID_MAP: Record<string, string> = {
  'seedance-1.5-pro-text-to-video': 'seedance-1.5-pro',
  'seedance-1.5-pro-image-to-video': 'seedance-1.5-pro',
  'seedance-2.0-pro-text-to-video': 'seedance-2.0',
  'seedance-2.0-pro-image-to-video': 'seedance-2.0',
  'seedance-1.0-pro-text-to-video': 'seedance-2.0',
  'seedance-1.0-pro-image-to-video': 'seedance-2.0',
  'seedance-2.0-fast-text-to-video': 'seedance-2.0-fast',
  'seedance-2.0-fast-image-to-video': 'seedance-2.0-fast',
};

// Models with restricted duration values on MaxAPI
const DURATION_CONSTRAINTS: Record<string, number[]> = {
  'seedance-1.5-pro': [5, 10],
};

/**
 * Snap duration to the nearest allowed value that is >= the requested duration.
 * This ensures users always get at least what they paid for.
 */
function snapDuration(duration: number, allowed: number[]): number {
  const sorted = [...allowed].sort((a, b) => a - b);
  return sorted.find((v) => v >= duration) ?? sorted[sorted.length - 1];
}

export class MaxApiProvider implements VideoProvider {
  private readonly client: MaxApiClient;

  constructor(apiKey: string) {
    this.client = new MaxApiClient(apiKey, '[MaxAPI]');
  }

  getName(): string {
    return 'maxapi';
  }

  private mapModelId(model: string): string {
    return MODEL_ID_MAP[model] || 'seedance-2.0';
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

  async submit(
    model: string,
    input: VideoGenerationRequest,
    webhookUrl?: string
  ): Promise<VideoGenerationResponse> {
    const imageUrls =
      input.image_urls || (input.image_url ? [input.image_url] : []);
    const aspectRatio = input.aspect_ratio || input.aspectRatio;
    const hasImages = imageUrls.length > 0;

    console.log(
      `[MaxAPI] Starting ${hasImages ? 'image-to-video' : 'text-to-video'} generation`
    );

    const inputObj: Record<string, unknown> = {
      prompt: input.prompt,
    };

    const mappedModel = this.mapModelId(model);

    if (input.duration) {
      let dur =
        typeof input.duration === 'string'
          ? Number.parseInt(input.duration, 10)
          : input.duration;

      const allowed = DURATION_CONSTRAINTS[mappedModel];
      if (allowed) {
        dur = snapDuration(dur, allowed);
      }

      inputObj.duration = dur;
    }

    if (hasImages) {
      inputObj.imageUrls = imageUrls;
    } else {
      const ratio = this.mapAspectRatio(aspectRatio);
      if (ratio) {
        inputObj.ratio = ratio;
      }
      if (input.resolution) {
        inputObj.resolution = input.resolution;
      }
    }

    const requestBody: Record<string, unknown> = {
      model: mappedModel,
      input: inputObj,
    };

    if (webhookUrl) {
      requestBody.callBackUrl = webhookUrl;
    }

    console.log('[MaxAPI] Request body:', JSON.stringify(requestBody, null, 2));

    const response = (await this.client.makeRequest(
      '/api/v1/task/submit',
      'POST',
      requestBody
    )) as {
      code: number;
      msg?: string;
      data?: { taskId?: string };
    };

    console.log('[MaxAPI] Submit response:', JSON.stringify(response, null, 2));

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
