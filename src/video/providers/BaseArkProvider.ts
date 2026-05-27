import { getVideoModel } from '../config/video-models';
import type {
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoGenerationResult,
  VideoGenerationStatus,
  VideoProvider,
} from '../types';

/**
 * Base provider class for Ark-compatible APIs (Volcano Engine, BytePlus)
 * Both providers share the same API format, only differing in base URL and name
 */
export abstract class BaseArkProvider implements VideoProvider {
  protected abstract baseUrl: string;
  protected abstract providerName: string;
  protected apiKey: string;
  // API model ID override from channel config (database-driven, immutable)
  // When set, this overrides the volcanoModel from model config
  private readonly apiModelIdOverride: string | null;

  constructor(apiKey: string, apiModelId?: string | null) {
    if (!apiKey) {
      throw new Error(`${this.getProviderDisplayName()} API key is required`);
    }
    this.apiKey = apiKey;
    this.apiModelIdOverride = apiModelId ?? null;
  }

  protected abstract getProviderDisplayName(): string;

  abstract getName(): string;

  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown
  ): Promise<unknown> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(
        `${this.getProviderDisplayName()} API request failed: ${response.status} ${response.statusText} - ${errorData}`
      );
    }

    return response.json();
  }

  async submit(
    model: string,
    input: VideoGenerationRequest,
    webhookUrl?: string
  ): Promise<VideoGenerationResponse> {
    const endpoint = '/contents/generations/tasks';

    // Get the actual model ID: apiModelIdOverride (from DB) > volcanoModel (from config) > raw model
    const modelConfig = getVideoModel(model);
    let arkModel = modelConfig?.volcanoModel || model;

    if (this.apiModelIdOverride) {
      console.log(
        `[${this.getProviderDisplayName()}] Using API model override: ${this.apiModelIdOverride} (original: ${arkModel})`
      );
      arkModel = this.apiModelIdOverride;
    }

    // Build request body according to Ark API format
    // Reference: https://docs.byteplus.com/en/docs/seedance
    const promptText = input.prompt;

    // Build content array - text first, then image (per API docs)
    const content: unknown[] = [
      {
        type: 'text',
        text: promptText,
      },
    ];

    // Add image content if provided (after text)
    // Support multiple images with roles for first_frame, last_frame, reference_image
    if (input.image_urls && input.image_urls.length > 0) {
      const roles = input.image_roles || [];
      input.image_urls.forEach((url, index) => {
        const imageContent: Record<string, unknown> = {
          type: 'image_url',
          image_url: {
            url: url,
          },
        };
        // Add role if specified
        if (roles[index]) {
          imageContent.role = roles[index];
        }
        content.push(imageContent);
      });
    } else if (input.image_url) {
      // Backward compatibility: single image without role
      content.push({
        type: 'image_url',
        image_url: {
          url: input.image_url,
        },
      });
    }

    // Seedance 2.0 multimodal reference inputs (BytePlus only).
    // Per docs, audio cannot be input alone — must accompany ≥1 image
    // or video. We forward whatever the caller sent and let the API
    // validate format/count caps (1-9 images, 1-3 videos, 1-3 audios,
    // total reference video/audio duration ≤ 15s).
    const referenceVideos = input.referenceVideos;
    if (Array.isArray(referenceVideos) && referenceVideos.length > 0) {
      for (const url of referenceVideos) {
        content.push({
          type: 'video_url',
          video_url: { url },
          role: 'reference_video',
        });
      }
    }
    const referenceAudios = input.referenceAudios;
    if (Array.isArray(referenceAudios) && referenceAudios.length > 0) {
      const hasImageRef =
        (input.image_urls && input.image_urls.length > 0) || !!input.image_url;
      const hasVideoRef =
        Array.isArray(referenceVideos) && referenceVideos.length > 0;
      if (!hasImageRef && !hasVideoRef) {
        throw new Error(
          'Reference audio requires at least one reference image or video (BytePlus Seedance 2.0 constraint).'
        );
      }
      for (const url of referenceAudios) {
        content.push({
          type: 'audio_url',
          audio_url: { url },
          role: 'reference_audio',
        });
      }
    }

    // Build request body with parameters in the recommended way (as top-level fields)
    // Reference: https://docs.byteplus.com/en/docs/ModelArk/1366799
    const requestBody: Record<string, unknown> = {
      model: arkModel,
      content,
    };

    // Add duration parameter (in seconds)
    if (input.duration) {
      requestBody.duration = Number(input.duration);
    }

    // Add aspect ratio parameter
    if (input.aspect_ratio) {
      // For image-to-video, use 'adaptive' to follow image dimensions
      const apiAspectRatio =
        input.aspect_ratio === 'Auto' ? 'adaptive' : input.aspect_ratio;
      requestBody.ratio = apiAspectRatio;
    }

    // Add resolution parameter
    const resolution =
      input.resolution || (input as Record<string, unknown>).resolution;
    if (resolution) {
      requestBody.resolution = String(resolution).toLowerCase();
    }

    // Add camera fixed parameter (default: false for dynamic camera)
    const cameraFixed = input.camera_fixed ?? false;
    requestBody.camera_fixed = cameraFixed;

    // Add audio generation parameter if enabled (only supported by Seedance 1.5 Pro)
    if (input.generate_audio) {
      requestBody.generate_audio = true;
    }

    // Disable watermark by default
    requestBody.watermark = input.watermarkEnabled ?? false;

    // Add webhook callback URL if provided
    if (webhookUrl) {
      requestBody.callback_url = webhookUrl;
    }

    console.log(
      `${this.getProviderDisplayName()} video generation request:`,
      JSON.stringify(requestBody, null, 2)
    );

    const response = (await this.makeRequest(
      endpoint,
      'POST',
      requestBody
    )) as Record<string, unknown>;

    return {
      request_id: response.id as string,
      status: 'submitted',
      model: model,
      raw_response: response,
    };
  }

  async status(
    model: string,
    requestId: string
  ): Promise<VideoGenerationStatus> {
    const endpoint = `/contents/generations/tasks/${requestId}`;

    const response = (await this.makeRequest(endpoint, 'GET')) as Record<
      string,
      unknown
    >;

    // Map Ark status to our standard status
    let standardStatus = 'unknown';
    switch (response.status) {
      case 'queued':
        standardStatus = 'IN_QUEUE';
        break;
      case 'running':
        standardStatus = 'IN_PROGRESS';
        break;
      case 'succeeded':
        standardStatus = 'COMPLETED';
        break;
      case 'failed':
        standardStatus = 'FAILED';
        break;
      case 'cancelled':
        standardStatus = 'CANCELLED';
        break;
      default:
        standardStatus = response.status as string;
    }

    return {
      request_id: requestId,
      status: standardStatus,
      progress: (response.progress as number) || undefined,
      logs: (response.logs as unknown[]) || [],
      metrics: response.metrics || {},
      error: (response.error as Record<string, unknown>)?.message as string,
      raw_data: response,
    };
  }

  async result(
    model: string,
    requestId: string
  ): Promise<VideoGenerationResult> {
    // For Ark providers, result is included in the status response when succeeded
    const statusResponse = await this.status(model, requestId);

    if (statusResponse.status !== 'COMPLETED') {
      throw new Error(
        `Task not completed. Current status: ${statusResponse.status}`
      );
    }

    const rawResponse = statusResponse.raw_data as Record<string, unknown>;
    const content = rawResponse?.content as Record<string, unknown>;
    const videoUrl = content?.video_url as string;

    if (!videoUrl) {
      throw new Error('Video URL not found in completed task response');
    }

    return {
      request_id: requestId,
      status: 'COMPLETED',
      video_url: videoUrl,
      data: {
        video_url: videoUrl,
        usage: rawResponse?.usage || {},
        model: rawResponse?.model,
        created_at: rawResponse?.created_at,
        updated_at: rawResponse?.updated_at,
      },
    };
  }
}
