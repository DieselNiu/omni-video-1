/**
 * Sd2 Manxue (Seedance 2) provider.
 *
 * Upstream: zcbservice.aizfw.cn/kyyReactApiServer
 *   POST /v1/sd2_manxue/videos   — create task
 *   GET  /v1/result/{id}         — poll status / fetch result
 *
 * The same upstream endpoint serves 4 modes — text-only, first-frame,
 * first-last-frame, and multi-asset reference (images + videos +
 * audios). We dispatch by inspecting `image_urls`, `generationType`,
 * and the new `referenceVideos` / `referenceAudios` fields on the
 * request. A single upstream `model` field carries the resolution
 * variant (`sd2_manxue_720p|1080p|2k|4k`); the registry's three
 * executable entries (text / image / reference) all share this
 * provider, picking the correct mode from request shape.
 *
 * Auth & base URL match the existing asset moderation client
 * (src/video/providers/seedance/asset-client.ts):
 *   - SEEDANCE_API_KEY for Bearer auth
 *   - SEEDANCE_BASE_URL to override host
 *
 * Unlike the asset endpoints the video endpoints don't wrap responses
 * in {code, msg, data}; they return the task object directly.
 */

import type {
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoGenerationResult,
  VideoGenerationStatus,
  VideoProvider,
} from '../types';

const DEFAULT_BASE_URL = 'https://zcbservice.aizfw.cn/kyyReactApiServer';

type UpstreamStatus = 'queued' | 'processing' | 'completed' | 'failed';

interface UpstreamTask {
  id: string | null;
  object: string;
  created: number;
  model: string | null;
  status: UpstreamStatus;
  video_url?: string | null;
  actualDuration?: number;
  error?: string | null;
}

function mapUpstreamStatus(s: UpstreamStatus): string {
  switch (s) {
    case 'queued':
      return 'IN_QUEUE';
    case 'processing':
      return 'IN_PROGRESS';
    case 'completed':
      return 'COMPLETED';
    case 'failed':
      return 'FAILED';
  }
}

function resolutionToModelId(resolution?: string): string {
  const r = (resolution || '1080p').toLowerCase().trim();
  if (r === '720p') return 'sd2_manxue_720p';
  if (r === '2k') return 'sd2_manxue_2k';
  if (r === '4k') return 'sd2_manxue_4k';
  return 'sd2_manxue_1080p';
}

const ALLOWED_RATIOS = new Set(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']);

function normaliseRatio(input?: string): string {
  if (!input) return '16:9';
  const v = input.toLowerCase().trim();
  if (v === 'landscape') return '16:9';
  if (v === 'portrait') return '9:16';
  if (v === 'square') return '1:1';
  if (v === 'auto') return '16:9';
  return ALLOWED_RATIOS.has(v) ? v : '16:9';
}

export class Sd2ManxueProvider implements VideoProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || process.env.SEEDANCE_BASE_URL || DEFAULT_BASE_URL;
  }

  getName(): string {
    return 'sd2_manxue';
  }

  async submit(
    _model: string,
    input: VideoGenerationRequest
  ): Promise<VideoGenerationResponse> {
    const body = this.buildBody(input);

    console.log('[Sd2Manxue] Submit body:', JSON.stringify(body, null, 2));

    const res = await fetch(`${this.baseUrl}/v1/sd2_manxue/videos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Sd2Manxue submit HTTP ${res.status}${text ? `: ${text}` : ''}`
      );
    }

    const data = (await res.json()) as UpstreamTask;
    if (data.status === 'failed' || !data.id) {
      throw new Error(data.error || 'Sd2Manxue task creation failed');
    }

    return {
      request_id: data.id,
      status: mapUpstreamStatus(data.status),
      model: _model,
      task_id: data.id,
      raw_response: data,
    };
  }

  async status(
    _model: string,
    requestId: string
  ): Promise<VideoGenerationStatus> {
    const data = await this.fetchResult(requestId);
    return {
      request_id: requestId,
      status: mapUpstreamStatus(data.status),
      error: data.error || undefined,
      error_message: data.error || undefined,
      raw_data: data,
    };
  }

  async result(
    _model: string,
    requestId: string
  ): Promise<VideoGenerationResult> {
    const data = await this.fetchResult(requestId);
    return {
      request_id: requestId,
      status: mapUpstreamStatus(data.status),
      video_url: data.video_url ?? null,
      data,
      error_message: data.error || undefined,
    };
  }

  private async fetchResult(requestId: string): Promise<UpstreamTask> {
    const res = await fetch(
      `${this.baseUrl}/v1/result/${encodeURIComponent(requestId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Sd2Manxue status HTTP ${res.status}${text ? `: ${text}` : ''}`
      );
    }
    return (await res.json()) as UpstreamTask;
  }

  /**
   * Translate the internal VideoGenerationRequest into the upstream
   * body shape, picking the right mode by inspecting which fields are
   * present. Mutually exclusive per the API:
   *   - first_image / last_image   ↔   referenceImages/Videos/Audios
   */
  private buildBody(input: VideoGenerationRequest): Record<string, unknown> {
    const imageUrls =
      input.image_urls || (input.image_url ? [input.image_url] : []);
    const referenceVideos = (input as { referenceVideos?: string[] })
      .referenceVideos;
    const referenceAudios = (input as { referenceAudios?: string[] })
      .referenceAudios;

    const body: Record<string, unknown> = {
      model: resolutionToModelId(input.resolution),
      prompt: input.prompt,
      ratio: normaliseRatio(input.aspect_ratio || input.aspectRatio),
    };

    if (input.duration !== undefined) {
      const d =
        typeof input.duration === 'string'
          ? Number.parseInt(input.duration, 10)
          : input.duration;
      if (Number.isFinite(d) && d > 0) {
        body.duration = d;
      }
    }

    const isReferenceMode =
      input.generationType === 'REFERENCE_2_VIDEO' ||
      (referenceVideos && referenceVideos.length > 0) ||
      (referenceAudios && referenceAudios.length > 0);

    if (isReferenceMode) {
      if (imageUrls.length > 0) body.referenceImages = imageUrls;
      if (referenceVideos && referenceVideos.length > 0) {
        body.referenceVideos = referenceVideos;
      }
      if (referenceAudios && referenceAudios.length > 0) {
        body.referenceAudios = referenceAudios;
      }
      return body;
    }

    if (imageUrls.length >= 2) {
      body.first_image = imageUrls[0];
      body.last_image = imageUrls[1];
    } else if (imageUrls.length === 1) {
      body.first_image = imageUrls[0];
    }

    return body;
  }
}
