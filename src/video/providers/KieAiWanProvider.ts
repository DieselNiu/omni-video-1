import type {
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoGenerationResult,
  VideoGenerationStatus,
  VideoProvider,
} from '../types';

// Map internal model IDs to KIE API model IDs
const MODEL_ID_MAP: Record<string, string> = {
  'wan22-text-to-video': 'wan/2-2-a14b-text-to-video-turbo',
  'wan26-text-to-video': 'wan/2-6-14b-text-to-video',
  'wan26-image-to-video': 'wan/2-6-14b-image-to-video',
};

export class KieAiWanProvider implements VideoProvider {
  private baseUrl = 'https://api.kie.ai/api/v1/jobs';
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Kie.ai API key is required');
    }
    this.apiKey = apiKey;
  }

  getName(): string {
    return 'kie-ai-wan';
  }

  private getKieModelId(internalModelId: string): string {
    return MODEL_ID_MAP[internalModelId] || internalModelId;
  }

  private isWan22Model(model: string): boolean {
    return model.includes('wan22') || model.includes('2-2');
  }

  private isWan26Model(model: string): boolean {
    return model.includes('wan26') || model.includes('2-6');
  }

  private isImageToVideoModel(model: string): boolean {
    return model.includes('image-to-video');
  }

  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown
  ): Promise<unknown> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(120000), // 2 minute timeout
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: { msg?: string; error?: { message?: string } };
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: { message: errorText } };
      }

      // Map error codes
      let errorMessage: string;
      switch (response.status) {
        case 401:
          errorMessage =
            'Unauthorized - Authentication credentials missing or invalid';
          break;
        case 402:
          errorMessage =
            'Insufficient Credits - Account does not have enough credits';
          break;
        case 404:
          errorMessage =
            'Not Found - The requested resource or endpoint does not exist';
          break;
        case 422:
          errorMessage =
            'Validation Error - The request parameters failed validation checks';
          break;
        case 429:
          errorMessage =
            'Rate Limited - Request limit has been exceeded for this resource';
          break;
        case 455:
          errorMessage =
            'Service Unavailable - System is currently undergoing maintenance';
          break;
        case 500:
          errorMessage =
            'Server Error - An unexpected error occurred while processing the request';
          break;
        case 501:
          errorMessage = 'Generation Failed - Video generation task failed';
          break;
        case 505:
          errorMessage =
            'Feature Disabled - The requested feature is currently disabled';
          break;
        default:
          errorMessage =
            errorData.msg ||
            errorData.error?.message ||
            errorText ||
            `API Error: ${response.status}`;
      }

      throw new Error(errorMessage);
    }

    return response.json();
  }

  async submit(
    model: string,
    input: VideoGenerationRequest,
    webhookUrl?: string
  ): Promise<VideoGenerationResponse> {
    try {
      const endpoint = '/createTask';
      const kieModelId = this.getKieModelId(model);
      const isWan22 = this.isWan22Model(model);
      const isWan26 = this.isWan26Model(model);
      const isI2V = this.isImageToVideoModel(model);

      // Build input object based on model type
      const inputObj: Record<string, unknown> = {
        prompt: input.prompt,
      };

      // Add image_url for image-to-video models
      if (isI2V) {
        if (input.image_urls && input.image_urls.length > 0) {
          inputObj.image_url = input.image_urls[0];
        } else if (input.image_url) {
          inputObj.image_url = input.image_url;
        }
      }

      // Resolution
      if (input.resolution) {
        inputObj.resolution = input.resolution;
      }

      // Aspect ratio
      const aspectRatio = input.aspect_ratio || input.aspectRatio;
      if (aspectRatio) {
        // For I2V, use 'auto' if not specified or if Auto is selected
        if (isI2V && (!aspectRatio || aspectRatio === 'Auto')) {
          inputObj.aspect_ratio = 'auto';
        } else {
          inputObj.aspect_ratio = aspectRatio;
        }
      }

      // Wan 2.2 specific parameters
      if (isWan22) {
        inputObj.enable_prompt_expansion = false;
        inputObj.acceleration = 'none';
      }

      // Wan 2.6 specific parameters
      if (isWan26) {
        // Duration (5 or 10 seconds)
        if (input.duration) {
          inputObj.duration = String(input.duration);
        }

        // Audio generation
        if (input.audio !== undefined) {
          inputObj.audio = input.audio;
        }

        // Prompt expansion (default to true)
        inputObj.enable_prompt_expansion = input.prompt_extend ?? true;

        // Negative prompt
        if (input.negative_prompt) {
          inputObj.negative_prompt = input.negative_prompt;
        }
      }

      const requestBody: Record<string, unknown> = {
        model: kieModelId,
        input: inputObj,
      };

      // Add callback URL if provided
      if (webhookUrl) {
        requestBody.callBackUrl = webhookUrl;
      }

      console.log(
        'Kie.ai Wan video generation request:',
        JSON.stringify(requestBody, null, 2)
      );

      const response = (await this.makeRequest(
        endpoint,
        'POST',
        requestBody
      )) as {
        code: number;
        msg?: string;
        data?: { taskId?: string };
      };

      console.log(
        'Kie.ai Wan submit response:',
        JSON.stringify(response, null, 2)
      );

      if (response.code !== 200) {
        throw new Error(response.msg || 'Generation request failed');
      }

      if (!response.data?.taskId) {
        throw new Error('No taskId received from Kie.ai Wan API');
      }

      return {
        request_id: response.data.taskId,
        status: 'submitted',
        model: model,
        task_id: response.data.taskId,
        raw_response: response,
      };
    } catch (error) {
      throw new Error(
        `Kie.ai Wan Provider submit failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async status(
    _model: string,
    requestId: string
  ): Promise<VideoGenerationStatus> {
    try {
      const endpoint = `/recordInfo?taskId=${encodeURIComponent(requestId)}`;
      const response = (await this.makeRequest(endpoint, 'GET')) as {
        code: number;
        msg?: string;
        data?: {
          state?: string;
          successFlag?: number | string;
          failCode?: string | null;
          failMsg?: string;
          errorCode?: string;
          errorMessage?: string;
          resultJson?: string;
          model?: string;
        };
      };

      // Handle API response errors
      if (response.code !== 200) {
        throw new Error(response.msg || 'Status check failed');
      }

      const data = response.data;
      const state = (data?.state || '').toString().toLowerCase();
      const successFlag =
        typeof data?.successFlag === 'number'
          ? data.successFlag
          : data?.successFlag === '1'
            ? 1
            : undefined;

      let status: string;
      let progress = 0;
      let error_message: string | undefined;

      const hasFailureCode =
        data?.failCode !== null && data?.failCode !== undefined;
      const hasErrorCode = !!data?.errorCode;

      if (hasErrorCode || state === 'fail' || hasFailureCode) {
        status = 'FAILED';
        progress = 100;
        error_message =
          data?.failMsg ||
          data?.errorMessage ||
          response.msg ||
          (hasErrorCode ? `Error code: ${data?.errorCode}` : undefined);
      } else if (state === 'success' || successFlag === 1) {
        let parsedResult: { resultUrls?: string[] } | null = null;
        if (data?.resultJson) {
          try {
            parsedResult = JSON.parse(data.resultJson);
          } catch (parseError) {
            console.error('Failed to parse Wan resultJson:', parseError);
          }
        }

        const hasResultUrl = Array.isArray(parsedResult?.resultUrls)
          ? parsedResult.resultUrls.length > 0
          : false;

        if (hasResultUrl) {
          status = 'COMPLETED';
          progress = 100;
        } else {
          status = 'IN_PROGRESS';
          progress = 90;
        }
      } else if (state === 'waiting' || state === 'pending') {
        status = 'IN_PROGRESS';
        progress = 25;
      } else if (state === 'processing') {
        status = 'IN_PROGRESS';
        progress = 60;
      } else {
        status = 'IN_PROGRESS';
        progress = 50;
      }

      return {
        request_id: requestId,
        status,
        progress,
        error_message,
        raw_data: data,
        model: data?.model,
      };
    } catch (error) {
      throw new Error(
        `Kie.ai Wan status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async result(
    _model: string,
    requestId: string
  ): Promise<VideoGenerationResult> {
    try {
      const statusResult = await this.status(_model, requestId);

      if (statusResult.status !== 'COMPLETED') {
        return {
          request_id: requestId,
          status: statusResult.status,
          data: statusResult.raw_data,
          model:
            statusResult.model ||
            (statusResult.raw_data as { model?: string })?.model,
          error_message: statusResult.error_message,
        };
      }

      const rawData = statusResult.raw_data as
        | { resultJson?: string; model?: string }
        | undefined;

      // Parse resultJson to get video URL
      let videoUrl = null;
      if (rawData?.resultJson) {
        try {
          const resultJson = JSON.parse(rawData.resultJson);
          videoUrl = resultJson.resultUrls?.[0] || null;
        } catch (e) {
          console.error('Failed to parse resultJson:', e);
        }
      }

      return {
        request_id: requestId,
        status: 'COMPLETED',
        video_url: videoUrl,
        data: rawData,
        model: rawData?.model,
      };
    } catch (error) {
      throw new Error(
        `Kie.ai Wan result retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
