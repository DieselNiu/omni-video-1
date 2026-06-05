/**
 * Apimart Video Provider for Seedance 2.0 and Veo 3.1 models.
 *
 * Upstream: https://api.apimart.ai async video generation.
 *   - Submit: POST /v1/videos/generations -> { code, data: [{ status, task_id }] }
 *   - Query:  GET  /v1/tasks/{task_id}    -> { code, data: { status, progress, result } }
 *
 * Backend model ids are mapped to Apimart upstream names:
 *   - *fast* -> doubao-seedance-2.0-fast-face
 *   - otherwise -> doubao-seedance-2.0-face
 *   - veo3-* -> veo3.1-fast by default, or apiModelId override from channel_config
 */

import type {
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoGenerationResult,
  VideoGenerationStatus,
  VideoProvider,
} from '../types';

const BASE_URL = 'https://api.apimart.ai';
const REQUEST_TIMEOUT = 30_000;
const LOG_TAG = '[Apimart-Video]';

const SUPPORTED_SIZES = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']);
const VEO3_MODEL = 'veo3.1-fast';

type SubmitResponse = {
  code: number;
  data?: Array<{ status: string; task_id: string }>;
  error?: { code: number; message: string; type: string };
};

type QueryResponse = {
  code: number;
  data?: {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    progress?: number;
    result?: {
      videos?: Array<{ url?: string | string[]; expires_at?: number }>;
      // return_last_frame: Apimart returns the trailing frame image. Exact
      // field is undocumented, so extractLastFrameUrl() probes several keys.
      last_frame?: unknown;
      last_frame_url?: unknown;
      image_url?: unknown;
      images?: unknown;
    };
    error?: { code?: number; message?: string; type?: string };
  };
  error?: { code: number; message: string; type: string };
};

function extractVideoUrl(
  result: { videos?: unknown } | undefined
): string | null {
  const videos = result?.videos;
  if (!Array.isArray(videos) || videos.length === 0) return null;
  const first = videos[0] as unknown;
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object') {
    const obj = first as Record<string, unknown>;
    const url = obj.url ?? obj.video_url;
    if (typeof url === 'string') return url;
    if (Array.isArray(url) && typeof url[0] === 'string') return url[0];
  }
  return null;
}

/**
 * Pull the last-frame image URL from an Apimart task result when
 * return_last_frame was requested. The field name isn't documented, so probe
 * likely candidates and accept string / {url} / [url] shapes.
 */
function extractLastFrameUrl(
  result:
    | {
        last_frame?: unknown;
        last_frame_url?: unknown;
        image_url?: unknown;
        images?: unknown;
      }
    | undefined
): string | null {
  if (!result) return null;
  const candidates = [
    result.last_frame_url,
    result.last_frame,
    result.image_url,
    Array.isArray(result.images) ? result.images[0] : undefined,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') return candidate;
    if (candidate && typeof candidate === 'object') {
      const obj = candidate as Record<string, unknown>;
      const url = obj.url ?? obj.image_url;
      if (typeof url === 'string') return url;
      if (Array.isArray(url) && typeof url[0] === 'string') return url[0];
    }
  }
  return null;
}

export class ApimartVideoProvider implements VideoProvider {
  private readonly apiKey: string;
  private readonly apiModelId?: string | null;

  constructor(apiKey: string, apiModelId?: string | null) {
    if (!apiKey) {
      throw new Error('APIMART_API_KEY is required for ApimartVideoProvider');
    }
    this.apiKey = apiKey;
    this.apiModelId = apiModelId;
  }

  getName(): string {
    return 'apimart-video';
  }

  private mapModelId(model: string): string {
    if (this.apiModelId) return this.apiModelId;
    if (model.includes('veo3')) return VEO3_MODEL;
    return /fast/i.test(model)
      ? 'doubao-seedance-2.0-fast-face'
      : 'doubao-seedance-2.0-face';
  }

  private isVeo3Model(model: string, upstreamModel: string): boolean {
    return model.includes('veo3') || upstreamModel.startsWith('veo3.');
  }

  private mapSize(aspectRatio?: string): string {
    if (!aspectRatio) return '16:9';
    const normalized = aspectRatio.toLowerCase().trim();
    if (normalized === 'auto' || normalized === 'adaptive') return 'adaptive';
    if (normalized === 'landscape') return '16:9';
    if (normalized === 'portrait') return '9:16';
    if (normalized === 'square') return '1:1';
    const match = normalized.match(/(\d+):(\d+)/);
    if (match) {
      const ratio = `${match[1]}:${match[2]}`;
      if (SUPPORTED_SIZES.has(ratio)) return ratio;
    }
    return '16:9';
  }

  private mapVeo3AspectRatio(aspectRatio?: string): string {
    if (!aspectRatio) return '16:9';
    const normalized = aspectRatio.toLowerCase().trim();
    if (normalized === 'portrait' || normalized.includes('9:16')) return '9:16';
    return '16:9';
  }

  private parseDuration(duration?: number | string): number {
    if (typeof duration === 'number') return duration;
    if (typeof duration === 'string') {
      const parsed = Number.parseInt(duration, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 8;
  }

  private buildVeo3SubmitBody(
    upstreamModel: string,
    input: VideoGenerationRequest,
    imageUrls: string[]
  ): Record<string, unknown> {
    if (upstreamModel.includes('lite') && imageUrls.length > 0) {
      throw new Error('Apimart veo3.1-lite does not support image inputs');
    }

    const body: Record<string, unknown> = {
      model: upstreamModel,
      prompt: input.prompt,
      duration: this.parseDuration(input.duration),
      aspect_ratio: this.mapVeo3AspectRatio(
        input.aspect_ratio || input.aspectRatio
      ),
    };

    if (input.resolution) {
      body.resolution = String(input.resolution).toLowerCase();
    }

    if (imageUrls.length > 0) {
      if (imageUrls.length > 3) {
        throw new Error(
          `Invalid number of images: ${imageUrls.length}. Apimart Veo 3.1 supports 0-3 images.`
        );
      }
      body.image_urls = imageUrls;
    }

    if (
      input.generationType === 'REFERENCE_2_VIDEO' ||
      input.image_roles?.some((role) => role === 'reference_image') ||
      imageUrls.length === 3
    ) {
      if (upstreamModel.includes('quality')) {
        throw new Error(
          'Apimart veo3.1-quality does not support reference-to-video mode'
        );
      }
      body.generation_type = 'reference';
    } else if (
      input.generationType === 'FIRST_AND_LAST_FRAMES_2_VIDEO' ||
      input.image_roles?.some((role) => role === 'last_frame') ||
      imageUrls.length === 2
    ) {
      body.generation_type = 'frame';
    }

    return body;
  }

  private async request(
    endpoint: string,
    method: 'GET' | 'POST',
    body?: unknown
  ): Promise<unknown> {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    };
    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${LOG_TAG} API error: ${response.status} - ${errorText}`);
      throw new Error(`Apimart error: ${response.status} - ${errorText}`);
    }
    return response.json();
  }

  async submit(
    model: string,
    input: VideoGenerationRequest,
    _webhookUrl?: string
  ): Promise<VideoGenerationResponse> {
    const upstreamModel = this.mapModelId(model);
    const isVeo3 = this.isVeo3Model(model, upstreamModel);
    const isFast = upstreamModel.includes('fast');

    const imageUrls =
      input.image_urls || (input.image_url ? [input.image_url] : []);
    const roles = input.image_roles;
    const hasImages = imageUrls.length > 0;
    const videoUrls = input.video_urls ?? input.referenceVideos ?? [];
    const audioUrls = input.audio_urls ?? input.referenceAudios ?? [];
    const hasVideos = videoUrls.length > 0;
    const usesFrameRoles =
      Array.isArray(roles) &&
      roles.some((role) => role === 'first_frame' || role === 'last_frame');

    console.log(
      `${LOG_TAG} Starting ${hasImages ? 'image-to-video' : 'text-to-video'} generation (${model} -> ${upstreamModel})`
    );

    const body: Record<string, unknown> = isVeo3
      ? this.buildVeo3SubmitBody(upstreamModel, input, imageUrls)
      : {
          model: upstreamModel,
          prompt: input.prompt,
          generate_audio: input.generate_audio !== false,
        };

    if (!isVeo3 && input.duration) {
      body.duration =
        typeof input.duration === 'string'
          ? Number.parseInt(input.duration, 10)
          : input.duration;
    }

    if (!isVeo3 && input.resolution) {
      let resolution = String(input.resolution).toLowerCase();
      if (isFast && resolution === '1080p') resolution = '720p';
      body.resolution = resolution;
    }

    if (!isVeo3 && typeof input.seed === 'number') {
      body.seed = input.seed;
    }

    if (!isVeo3 && imageUrls.length > 9) {
      throw new Error(
        `Invalid number of images: ${imageUrls.length}. Apimart Seedance 2.0 supports at most 9 reference images.`
      );
    }
    if (!isVeo3 && videoUrls.length > 3) {
      throw new Error(
        `Invalid number of reference videos: ${videoUrls.length}. Apimart Seedance 2.0 supports at most 3 reference videos.`
      );
    }
    if (!isVeo3 && audioUrls.length > 3) {
      throw new Error(
        `Invalid number of reference audios: ${audioUrls.length}. Apimart Seedance 2.0 supports at most 3 reference audios.`
      );
    }
    if (!isVeo3 && usesFrameRoles && (hasVideos || audioUrls.length > 0)) {
      throw new Error(
        'Apimart Seedance 2.0 does not allow video_urls or audio_urls with first/last-frame image_with_roles.'
      );
    }
    if (!isVeo3 && audioUrls.length > 0 && !hasImages && !hasVideos) {
      throw new Error(
        'Apimart Seedance 2.0 reference audio requires at least one reference image or reference video.'
      );
    }
    if (
      !isVeo3 &&
      hasVideos &&
      typeof input.inputVideoDurationSeconds === 'number' &&
      input.inputVideoDurationSeconds <= 1.8
    ) {
      throw new Error(
        'Apimart Seedance 2.0 reference video total duration must be greater than 1.8 seconds.'
      );
    }
    if (
      !isVeo3 &&
      hasVideos &&
      typeof input.inputVideoDurationSeconds === 'number' &&
      input.inputVideoDurationSeconds >= 15.2
    ) {
      throw new Error(
        'Apimart Seedance 2.0 reference video total duration must be less than 15.2 seconds.'
      );
    }

    // Seedance 2.0: return the trailing frame image for continuous generation.
    if (!isVeo3 && input.return_last_frame) {
      body.return_last_frame = true;
    }

    // Reference videos / audio (Seedance 2.0 face reference mode). Apimart
    // infers reference generation from these arrays plus image_with_roles
    // role=reference_image, so no generation_type field is needed.
    if (!isVeo3 && hasVideos) {
      body.video_urls = videoUrls;
    }
    if (!isVeo3 && audioUrls.length > 0) {
      body.audio_urls = audioUrls;
    }

    if (!isVeo3 && hasImages) {
      // First/last-frame uploads must use image_with_roles; a plain first
      // frame can go through image_urls. Apimart auto-fits the size, so use
      // adaptive when an input image drives the geometry.
      const usesRoles =
        Array.isArray(roles) &&
        roles.length === imageUrls.length &&
        roles.some((role) => role === 'last_frame');
      if (usesRoles) {
        body.image_with_roles = imageUrls.map((url, index) => ({
          url,
          role: roles![index],
        }));
      } else {
        body.image_urls = imageUrls;
      }
      body.size = 'adaptive';
    } else if (!isVeo3 && hasVideos) {
      // Video-only reference: let Apimart match the reference geometry.
      body.size = 'adaptive';
    } else if (!isVeo3) {
      body.size = this.mapSize(input.aspect_ratio || input.aspectRatio);
    }

    console.log(
      `${LOG_TAG} Submit body:`,
      JSON.stringify(
        {
          ...body,
          image_urls: hasImages ? `[${imageUrls.length} items]` : undefined,
        },
        null,
        2
      )
    );

    const response = (await this.request(
      '/v1/videos/generations',
      'POST',
      body
    )) as SubmitResponse;

    const taskId = response.data?.[0]?.task_id;
    if (response.code !== 200 || !taskId) {
      throw new Error(
        response.error?.message || 'Apimart video task submission failed'
      );
    }

    return {
      request_id: taskId,
      status: 'IN_QUEUE',
      model,
      task_id: taskId,
      raw_response: response,
    };
  }

  private async queryTask(taskId: string): Promise<QueryResponse> {
    return (await this.request(
      `/v1/tasks/${encodeURIComponent(taskId)}`,
      'GET'
    )) as QueryResponse;
  }

  async status(
    _model: string,
    requestId: string
  ): Promise<VideoGenerationStatus> {
    const response = await this.queryTask(requestId);
    const taskStatus = response.data?.status;

    let status: string;
    let progress: number;
    let error_message: string | undefined;

    if (taskStatus === 'completed') {
      status = 'COMPLETED';
      progress = 100;
    } else if (taskStatus === 'failed' || taskStatus === 'cancelled') {
      status = 'FAILED';
      progress = 100;
      error_message =
        response.data?.error?.message ||
        response.error?.message ||
        'Generation failed';
    } else {
      status = 'IN_PROGRESS';
      progress = response.data?.progress ?? 0;
    }

    return {
      request_id: requestId,
      status,
      progress,
      error_message,
      raw_data: response.data,
    };
  }

  async result(
    _model: string,
    requestId: string
  ): Promise<VideoGenerationResult> {
    const response = await this.queryTask(requestId);
    const taskStatus = response.data?.status;

    if (taskStatus === 'failed' || taskStatus === 'cancelled') {
      return {
        request_id: requestId,
        status: 'FAILED',
        error_message:
          response.data?.error?.message ||
          response.error?.message ||
          'Generation failed',
        data: response.data,
      };
    }

    if (taskStatus !== 'completed') {
      return {
        request_id: requestId,
        status: 'IN_PROGRESS',
        data: response.data,
      };
    }

    return {
      request_id: requestId,
      status: 'COMPLETED',
      video_url: extractVideoUrl(response.data?.result),
      last_frame_url: extractLastFrameUrl(response.data?.result),
      data: response.data,
    };
  }
}
