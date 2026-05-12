/**
 * Apimart Image Generation Provider
 *
 * Upstream: https://api.apimart.ai — OpenAI-compatible Images protocol in async mode.
 * All nano-banana family models are mapped to the single upstream model `gpt-image-2`.
 * Base64 and URL references are passed through inline; apimart handles them server-side.
 */

import type { ImageExecutableModel } from '@/models/types';
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageGenerationResult,
  ImageGenerationStatus,
  ImageProvider,
} from '../types';

const BASE_URL = 'https://api.apimart.ai';
const REQUEST_TIMEOUT = 30_000;
const LOG_TAG = 'Apimart';
const UPSTREAM_MODEL = 'gpt-image-2';

// Apimart accepts only ratio strings from this whitelist; pixel sizes are rejected.
const SUPPORTED_RATIOS = new Set([
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '2:1',
  '1:2',
  '21:9',
  '9:21',
]);

type SubmitResponse = {
  code: number;
  data?: Array<{ status: string; task_id: string }>;
  error?: { code: number; message: string; type: string };
};

type QueryResponse = {
  code: number;
  data?: {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress?: number;
    result?: {
      images?: Array<{ url: string[]; expires_at?: number }>;
    };
    error?: { message?: string };
  };
  error?: { code: number; message: string; type: string };
};

export class ApimartProvider implements ImageProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('APIMART_API_KEY is required for ApimartProvider');
    }
    this.apiKey = apiKey;
  }

  getName(): string {
    return 'apimart-gpt-image-2';
  }

  private mapAspectRatio(aspectRatio?: string): string {
    if (!aspectRatio) return '1:1';
    const normalized = aspectRatio.toLowerCase().trim();
    if (normalized === 'landscape') return '16:9';
    if (normalized === 'portrait') return '9:16';
    if (normalized === 'square') return '1:1';
    const match = normalized.match(/(\d+):(\d+)/);
    if (match) {
      const ratio = `${match[1]}:${match[2]}`;
      if (SUPPORTED_RATIOS.has(ratio)) return ratio;
    }
    return '1:1';
  }

  private async request(
    endpoint: string,
    method: 'GET' | 'POST',
    body?: unknown
  ): Promise<unknown> {
    const url = `${BASE_URL}${endpoint}`;
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

    const response = await fetch(url, options);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[${LOG_TAG}] API error: ${response.status} - ${errorText}`
      );
      throw new Error(`Apimart error: ${response.status} - ${errorText}`);
    }
    return response.json();
  }

  async submit(
    executable: ImageExecutableModel,
    input: ImageGenerationRequest,
    _webhookUrl?: string
  ): Promise<ImageGenerationResponse> {
    const imageUrls = input.image_urls || [];
    const hasImages = imageUrls.length > 0;

    // apimart only serves `gpt-image-2` today; executable.binding.apiModelId
    // is expected to equal UPSTREAM_MODEL. Trust the binding either way.
    const upstreamModel = executable.binding.apiModelId || UPSTREAM_MODEL;

    console.log(
      `[${LOG_TAG}] Starting ${hasImages ? 'image-to-image' : 'text-to-image'} generation (executable=${executable.id} -> ${upstreamModel})`
    );

    // Prefer the apimart-native `size` when the caller supplied it; otherwise
    // normalise the legacy `aspect_ratio` (used by the web submit route).
    const size = input.size
      ? this.mapAspectRatio(input.size)
      : this.mapAspectRatio(input.aspect_ratio);

    const body: Record<string, unknown> = {
      model: upstreamModel,
      prompt: input.prompt,
      n: input.n ?? 1,
      size,
    };
    if (input.resolution) {
      // apimart expects lowercase '1k'|'2k'|'4k'
      body.resolution = String(input.resolution).toLowerCase();
    }
    if (hasImages) {
      body.image_urls = imageUrls;
    }

    console.log(
      `[${LOG_TAG}] Submit body:`,
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
      '/v1/images/generations',
      'POST',
      body
    )) as SubmitResponse;

    const taskId = response.data?.[0]?.task_id;
    if (response.code !== 200 || !taskId) {
      const msg = response.error?.message || 'Apimart task submission failed';
      throw new Error(msg);
    }

    return {
      request_id: taskId,
      status: 'IN_QUEUE',
      model: executable.id,
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
  ): Promise<ImageGenerationStatus> {
    const response = await this.queryTask(requestId);
    const taskStatus = response.data?.status;

    let status: string;
    let progress: number;
    let error_message: string | undefined;

    if (taskStatus === 'completed') {
      status = 'COMPLETED';
      progress = 100;
    } else if (taskStatus === 'failed') {
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
  ): Promise<ImageGenerationResult> {
    const response = await this.queryTask(requestId);
    const taskStatus = response.data?.status;

    if (taskStatus === 'failed') {
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

    const urls = (response.data?.result?.images ?? []).flatMap(
      (img) => img.url || []
    );

    return {
      request_id: requestId,
      status: 'COMPLETED',
      image_urls: urls,
      data: response.data,
    };
  }
}
