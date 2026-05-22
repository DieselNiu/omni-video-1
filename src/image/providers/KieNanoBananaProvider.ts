/**
 * Kie.ai Nano Banana AI Image Generation Provider
 * Integrates with Kie.ai API for Nano Banana image generation (async with webhook callback)
 */

import { buildWebhookUrl } from '@/lib/urls/urls';
import type { ImageExecutableModel } from '@/models/types';
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageGenerationResult,
  ImageGenerationStatus,
  ImageProvider,
} from '../types';

// API Response type
interface KieApiResponse {
  code: number;
  message?: string;
  data?: {
    taskId: string;
    recordId: string;
  };
}

// Task detail response shape from /api/v1/jobs/recordInfo
interface KieRecordInfoData {
  taskId: string;
  model?: string;
  state: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';
  param?: string;
  resultJson?: string;
  failCode?: string;
  failMsg?: string;
  costTime?: number;
  completeTime?: number;
  createTime?: number;
  updateTime?: number;
  progress?: number;
}

interface KieRecordInfoResponse {
  code: number;
  msg?: string;
  data?: KieRecordInfoData;
}

const KIE_RECORD_INFO_URL = '/api/v1/jobs/recordInfo';

// Map Kie's state enum onto the shared ImageGeneration* status vocabulary.
// resolveImageGenerationStatus() checks for literal 'COMPLETED' / 'FAILED'.
function mapKieStateToStatus(state?: KieRecordInfoData['state']): string {
  switch (state) {
    case 'success':
      return 'COMPLETED';
    case 'fail':
      return 'FAILED';
    case 'waiting':
    case 'queuing':
    case 'generating':
      return 'PROCESSING';
    default:
      return 'pending';
  }
}

/**
 * Kie exposes two request-body shapes behind two different endpoints. The
 * registry's `binding.providerOptions.bodyVersion` picks which one applies;
 * 'v2' / 'gpt-image-2' → /api/v1/jobs/createTask with image_input field,
 * 'legacy' (or unset) → /api/v1/playground/createTask with image_urls field.
 */
function endpointUrl(bodyVersion: string | undefined): string {
  if (bodyVersion === 'v2' || bodyVersion === 'gpt-image-2') {
    return '/api/v1/jobs/createTask';
  }
  return '/api/v1/playground/createTask';
}

export class KieNanoBananaProvider implements ImageProvider {
  private readonly baseUrl = 'https://api.kie.ai';
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('KIE_AI_API_KEY is required for KieNanoBananaProvider');
    }
    this.apiKey = apiKey;
  }

  getName(): string {
    return 'kie-nano-banana';
  }

  async submit(
    executable: ImageExecutableModel,
    input: ImageGenerationRequest,
    webhookUrl?: string
  ): Promise<ImageGenerationResponse> {
    if (executable.binding.provider !== 'kie') {
      throw new Error(
        `KieNanoBananaProvider got non-kie binding: ${executable.binding.provider}`
      );
    }

    const bodyVersion = executable.binding.providerOptions?.bodyVersion;
    const callbackUrl = webhookUrl || this.getCallbackUrl();
    const url = endpointUrl(bodyVersion);
    const body = this.buildRequestBody(
      executable.binding.apiModelId,
      bodyVersion,
      input,
      callbackUrl
    );

    console.log(
      `[Kie] ${executable.binding.apiModelId} (bodyVersion=${bodyVersion ?? 'legacy'}) Request:`,
      JSON.stringify(body, null, 2)
    );

    const response = await this.makeRequest(url, body);

    return {
      request_id: response.data!.taskId,
      status: 'submitted',
      model: executable.id,
      record_id: response.data!.recordId,
      raw_response: response,
    };
  }

  // Kie normally pushes results via webhook. status() / result() poll Kie's
  // unified record-info endpoint as a fallback for environments where the
  // webhook can't land (local dev) or for the status route's slow-webhook
  // safety net — without this, a missed webhook leaves the task stuck in
  // PROCESSING forever even though Kie already finished the work.
  async status(
    _model: string,
    requestId: string
  ): Promise<ImageGenerationStatus> {
    const info = await this.fetchRecordInfo(requestId);
    return {
      request_id: requestId,
      status: mapKieStateToStatus(info?.state),
      progress: info?.progress,
      error_message: info?.failMsg || undefined,
      raw_data: info,
    };
  }

  async result(
    _model: string,
    requestId: string
  ): Promise<ImageGenerationResult> {
    const info = await this.fetchRecordInfo(requestId);
    const status = mapKieStateToStatus(info?.state);

    let imageUrls: string[] | undefined;
    if (status === 'COMPLETED' && info?.resultJson) {
      try {
        const parsed = JSON.parse(info.resultJson) as { resultUrls?: string[] };
        imageUrls = parsed.resultUrls;
      } catch (err) {
        console.warn(
          `[Kie] Failed to parse resultJson for task ${requestId}:`,
          err
        );
      }
    }

    return {
      request_id: requestId,
      status,
      image_urls: imageUrls,
      error_message: info?.failMsg || undefined,
      data: info,
    };
  }

  private async fetchRecordInfo(
    taskId: string
  ): Promise<KieRecordInfoData | undefined> {
    const url = `${this.baseUrl}${KIE_RECORD_INFO_URL}?taskId=${encodeURIComponent(taskId)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Kie recordInfo error: ${response.status} - ${errorText}`
      );
    }

    const json = (await response.json()) as KieRecordInfoResponse;
    // Kie returns non-200 codes like 422 for "recordInfo not ready" while the
    // task is still pending. Treat them as "no data yet" rather than throwing.
    if (json.code !== 200) return undefined;
    return json.data;
  }

  // --- Private Methods ---

  private getCallbackUrl(): string {
    const baseUrl =
      process.env.WEBHOOK_BASE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      'http://localhost:3000';
    return buildWebhookUrl(baseUrl, '/api/ai-callback/nano-banana');
  }

  private buildRequestBody(
    apiModelId: string,
    bodyVersion: string | undefined,
    input: ImageGenerationRequest,
    callbackUrl: string
  ): Record<string, unknown> {
    // v2 / gpt-image-2 body shape: structured `input` with image_input + aspect_ratio.
    if (bodyVersion === 'v2' || bodyVersion === 'gpt-image-2') {
      return {
        model: apiModelId,
        callBackUrl: callbackUrl,
        input: {
          prompt: input.prompt,
          image_input: input.image_urls || [],
          aspect_ratio: input.aspect_ratio || '1:1',
          resolution: input.resolution || '1K',
          output_format: input.output_format || 'png',
        },
      };
    }

    // Legacy body shape: flat `input` with image_urls + image_size.
    return {
      model: apiModelId,
      callBackUrl: callbackUrl,
      input: {
        prompt: input.prompt,
        ...(input.image_urls?.length && { image_urls: input.image_urls }),
        ...(input.output_format && { output_format: input.output_format }),
        ...(input.aspect_ratio && {
          image_size: input.aspect_ratio.toLowerCase(),
        }),
      },
    };
  }

  private async makeRequest(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<KieApiResponse> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kie API error: ${response.status} - ${errorText}`);
    }

    const apiResponse = (await response.json()) as KieApiResponse;

    if (apiResponse.code !== 200 || !apiResponse.data) {
      throw new Error(
        `Kie API error: ${apiResponse.code} - ${apiResponse.message || 'Unknown error'}`
      );
    }

    return apiResponse;
  }
}
