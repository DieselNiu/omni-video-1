/**
 * Alibaba DashScope (Wan) Image Generation Provider
 *
 * Upstream: Alibaba Cloud Model Studio (百炼) — Wan 2.7 image generation &
 * editing models (`wan2.7-image`, `wan2.7-image-pro`).
 *
 * Protocol: async only. Submit creates a task and returns a `task_id`; the
 * caller polls `GET /api/v1/tasks/{task_id}` until SUCCEEDED/FAILED. There is
 * no webhook — the platform's poll-based `resolveImageGenerationStatus`
 * fallback drives completion via `result()`, mirroring ApimartProvider.
 *
 * Region: Singapore (international) endpoint, matching the Wan video
 * AliProvider and the shared `ALI_API_KEY` (an ap-southeast-1 key). Beijing
 * and Singapore keys/endpoints are NOT interchangeable.
 *
 * Request shape (see help.aliyun.com Wan image API reference):
 *   POST /api/v1/services/aigc/image-generation/generation
 *   { model, input: { messages: [{ role:'user', content:[{text},{image}...] }] },
 *     parameters: { size, n, watermark, thinking_mode, seed } }
 */

import type { ImageExecutableModel } from '@/models/types';
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageGenerationResult,
  ImageGenerationStatus,
  ImageProvider,
} from '../types';

// Singapore (international) region — same as the Wan video AliProvider.
const BASE_URL = 'https://dashscope-intl.aliyuncs.com';
const SUBMIT_ENDPOINT = '/api/v1/services/aigc/image-generation/generation';
const REQUEST_TIMEOUT = 30_000;
const LOG_TAG = 'Ali-Wan-Image';
const DEFAULT_MODEL = 'wan2.7-image';

// Aspect ratios we surface for Wan image. Used to derive pixel dimensions for
// text-to-image (resolution-spec mode produces a square when there's no input
// image, so we send explicit W*H to honour the requested ratio).
const RATIO_DIMENSIONS: Record<string, [number, number]> = {
  '1:1': [1, 1],
  '16:9': [16, 9],
  '9:16': [9, 16],
  '4:3': [4, 3],
  '3:4': [3, 4],
};

// Target total pixels per resolution tier. Wan accepts pixel sizes in
// [768*768, 2048*2048] for wan2.7-image.
const TARGET_TOTAL_PIXELS: Record<string, number> = {
  '1K': 1024 * 1024,
  '2K': 2048 * 2048,
};

type SubmitResponse = {
  output?: { task_id?: string; task_status?: string };
  request_id?: string;
  code?: string;
  message?: string;
};

interface TaskContent {
  type?: string;
  image?: string;
  text?: string;
}

type TaskResponse = {
  output?: {
    task_id?: string;
    task_status?: string;
    choices?: Array<{ message?: { content?: TaskContent[] } }>;
    code?: string;
    message?: string;
  };
  usage?: unknown;
  request_id?: string;
  code?: string;
  message?: string;
};

export class AliImageProvider implements ImageProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('ALI_API_KEY is required for AliImageProvider');
    }
    this.apiKey = apiKey;
  }

  getName(): string {
    return 'ali-wan-image';
  }

  private async request(
    endpoint: string,
    method: 'GET' | 'POST',
    body?: unknown
  ): Promise<unknown> {
    const url = `${BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'X-DashScope-DataInspection': '{"input":"disable", "output":"disable"}',
    };
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      // Wan image generation only supports the async protocol.
      headers['X-DashScope-Async'] = 'enable';
    }

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    };
    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const code = data.code || 'Unknown';
      const message = data.message || response.statusText;
      console.error(`[${LOG_TAG}] API error: ${code} - ${message}`);
      throw new Error(`Ali image API error: ${code} - ${message}`);
    }

    return data;
  }

  /**
   * Compute an explicit pixel `size` ("W*H") for text-to-image so the output
   * honours the requested aspect ratio. Snaps each side to a multiple of 32
   * (DashScope is tolerant but prefers aligned dimensions) and clamps to the
   * [768, 2048] per-side envelope.
   */
  private pixelSize(aspectRatio: string, resolution?: string): string {
    const [w, h] = RATIO_DIMENSIONS[aspectRatio] ?? RATIO_DIMENSIONS['1:1'];
    const total =
      TARGET_TOTAL_PIXELS[(resolution || '1K').toUpperCase()] ??
      TARGET_TOTAL_PIXELS['1K'];
    const ratio = w / h;
    let width = Math.sqrt(total * ratio);
    let height = Math.sqrt(total / ratio);
    const snap = (v: number) =>
      Math.min(2048, Math.max(768, Math.round(v / 32) * 32));
    width = snap(width);
    height = snap(height);
    return `${width}*${height}`;
  }

  async submit(
    executable: ImageExecutableModel,
    input: ImageGenerationRequest,
    _webhookUrl?: string
  ): Promise<ImageGenerationResponse> {
    const model = executable.binding.apiModelId || DEFAULT_MODEL;
    const imageUrls = input.image_urls || [];
    const hasImages = imageUrls.length > 0;

    // Build the single-turn user message: prompt text + any reference images.
    const content: TaskContent[] = [{ text: input.prompt }];
    for (const url of imageUrls) {
      content.push({ image: url });
    }

    const parameters: Record<string, unknown> = {
      n: input.n ?? 1,
      watermark: false,
    };

    if (hasImages) {
      // Image edit / reference: output ratio follows the input image, so a
      // resolution tier is the correct knob (avoids fighting the input ratio).
      parameters.size = (input.resolution || '1K').toUpperCase();
    } else {
      // Pure text-to-image: send explicit pixels to honour the aspect ratio,
      // and enable thinking mode (only effective for non-group t2i) for
      // higher-quality output.
      parameters.size = this.pixelSize(
        input.aspect_ratio || '1:1',
        input.resolution
      );
      parameters.thinking_mode = true;
    }

    const body = {
      model,
      input: {
        messages: [{ role: 'user', content }],
      },
      parameters,
    };

    console.log(
      `[${LOG_TAG}] Submitting ${hasImages ? 'image-to-image' : 'text-to-image'} (executable=${executable.id} -> ${model})`,
      JSON.stringify(
        {
          ...body,
          input: {
            messages: [
              {
                role: 'user',
                content: hasImages
                  ? [{ text: input.prompt }, `[${imageUrls.length} image(s)]`]
                  : content,
              },
            ],
          },
        },
        null,
        2
      )
    );

    const response = (await this.request(
      SUBMIT_ENDPOINT,
      'POST',
      body
    )) as SubmitResponse;

    const taskId = response.output?.task_id;
    if (!taskId) {
      throw new Error(
        response.message || 'Ali image task submission returned no task_id'
      );
    }

    return {
      request_id: taskId,
      status: 'IN_QUEUE',
      model: executable.id,
      raw_response: response,
    };
  }

  private async queryTask(taskId: string): Promise<TaskResponse> {
    return (await this.request(
      `/api/v1/tasks/${encodeURIComponent(taskId)}`,
      'GET'
    )) as TaskResponse;
  }

  private mapStatus(taskStatus?: string): string {
    switch (taskStatus) {
      case 'PENDING':
        return 'IN_QUEUE';
      case 'RUNNING':
        return 'IN_PROGRESS';
      case 'SUCCEEDED':
        return 'COMPLETED';
      case 'FAILED':
        return 'FAILED';
      case 'CANCELED':
        return 'CANCELLED';
      default:
        return taskStatus || 'UNKNOWN';
    }
  }

  private extractImageUrls(response: TaskResponse): string[] {
    const choices = response.output?.choices ?? [];
    return choices.flatMap((choice) =>
      (choice.message?.content ?? [])
        .filter((c) => c.type === 'image' && typeof c.image === 'string')
        .map((c) => c.image as string)
    );
  }

  async status(
    _model: string,
    requestId: string
  ): Promise<ImageGenerationStatus> {
    const response = await this.queryTask(requestId);
    const status = this.mapStatus(response.output?.task_status);

    return {
      request_id: requestId,
      status,
      progress: status === 'COMPLETED' ? 100 : 0,
      error_message:
        status === 'FAILED'
          ? response.output?.message || response.message || 'Generation failed'
          : undefined,
      raw_data: response.output,
    };
  }

  async result(
    _model: string,
    requestId: string
  ): Promise<ImageGenerationResult> {
    const response = await this.queryTask(requestId);
    const status = this.mapStatus(response.output?.task_status);

    if (status === 'FAILED' || status === 'CANCELLED') {
      return {
        request_id: requestId,
        status: 'FAILED',
        error_message:
          response.output?.message || response.message || 'Generation failed',
        data: response.output,
      };
    }

    if (status !== 'COMPLETED') {
      return {
        request_id: requestId,
        status: 'IN_PROGRESS',
        data: response.output,
      };
    }

    return {
      request_id: requestId,
      status: 'COMPLETED',
      image_urls: this.extractImageUrls(response),
      data: response.output,
    };
  }
}
