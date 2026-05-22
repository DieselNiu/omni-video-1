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

  // Kie.ai uses webhook callbacks - status polling not supported
  async status(
    _model: string,
    requestId: string
  ): Promise<ImageGenerationStatus> {
    return {
      request_id: requestId,
      status: 'pending',
      raw_data: { message: 'Status updates via webhook callback only' },
    };
  }

  // Kie.ai uses webhook callbacks - direct result fetching not supported
  async result(
    _model: string,
    requestId: string
  ): Promise<ImageGenerationResult> {
    return {
      request_id: requestId,
      status: 'pending',
      data: { message: 'Results delivered via webhook callback only' },
    };
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
