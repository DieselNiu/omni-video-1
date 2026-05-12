import type {
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoGenerationResult,
  VideoGenerationStatus,
  VideoProvider,
} from '../types';

export class KieAiVeo3Provider implements VideoProvider {
  private baseUrl = 'https://kieai.erweima.ai/api/v1/veo';
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Kie.ai API key is required');
    }
    this.apiKey = apiKey;
  }

  getName(): string {
    return 'kie-ai-veo3';
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

      // Map error codes based on API documentation
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
      const endpoint = '/generate';

      // Build request body according to Kie.ai API format
      const requestBody: Record<string, unknown> = {
        prompt: input.prompt,
        model: 'veo3_fast',
      };

      // Handle generationType (e.g., REFERENCE_2_VIDEO)
      if (input.generationType) {
        requestBody.generationType = input.generationType;
      }

      // Add image URLs if provided (supports 1-2 images, REFERENCE_2_VIDEO supports 1-3)
      if (input.image_urls && input.image_urls.length > 0) {
        requestBody.imageUrls = input.image_urls;
      } else if (input.image_url) {
        requestBody.imageUrls = [input.image_url];
      }

      // Add aspect ratio if provided
      if (input.aspect_ratio || input.aspectRatio) {
        requestBody.aspectRatio = input.aspect_ratio || input.aspectRatio;
      }

      // Add seed if provided
      if (input.seed) {
        requestBody.seeds = input.seed;
      }

      // Add watermark if enabled
      if (input.watermarkEnabled) {
        requestBody.watermark = 'veo3ai.io';
      }

      // Add callback URL if provided
      if (webhookUrl) {
        requestBody.callBackUrl = webhookUrl;
      }

      console.log(
        'Kie.ai Veo3 video generation request:',
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
        'Kie.ai Veo3 submit response:',
        JSON.stringify(response, null, 2)
      );

      if (response.code !== 200) {
        throw new Error(response.msg || 'Generation request failed');
      }

      if (!response.data?.taskId) {
        throw new Error('No taskId received from Kie.ai API');
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
        `Kie.ai Veo3 Provider submit failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async status(
    _model: string,
    requestId: string
  ): Promise<VideoGenerationStatus> {
    try {
      const endpoint = `/record-info?taskId=${encodeURIComponent(requestId)}`;
      const response = (await this.makeRequest(endpoint, 'GET')) as {
        code: number;
        msg?: string;
        data?: {
          errorCode?: string;
          errorMessage?: string;
          successFlag?: number;
          completeTime?: string;
          response?: { resultUrls?: string[] };
        };
      };

      // Handle API response errors
      if (response.code !== 200) {
        if (response.code === 400 && response.msg?.includes('1080P')) {
          return {
            request_id: requestId,
            status: 'IN_PROGRESS',
            progress: 90,
            raw_data: response,
          };
        }
        throw new Error(response.msg || 'Status check failed');
      }

      const data = response.data;

      // Map response to standard status
      let status: string;
      let progress = 0;
      let error_message: string | undefined;

      if (data?.errorCode) {
        status = 'FAILED';
        progress = 0;
        error_message =
          data.errorMessage || response.msg || `Error code: ${data.errorCode}`;
      } else if (
        data?.successFlag === 1 &&
        data?.completeTime &&
        data?.response?.resultUrls?.length &&
        data.response.resultUrls.length > 0
      ) {
        status = 'COMPLETED';
        progress = 100;
      } else {
        status = 'IN_PROGRESS';
        progress = data?.successFlag === 0 ? 25 : 50;
      }

      return {
        request_id: requestId,
        status,
        progress,
        error_message,
        raw_data: data,
      };
    } catch (error) {
      throw new Error(
        `Kie.ai status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Private method to attempt 1080P video retrieval
  private async get1080P(requestId: string): Promise<{
    hd_video_url?: string;
    hd_available: boolean;
    hd_processing: boolean;
  }> {
    try {
      const endpoint = `/get-1080p-video?taskId=${encodeURIComponent(requestId)}`;

      const response = (await this.makeRequest(endpoint, 'GET')) as {
        code: number;
        msg?: string;
        data?: { videoUrl?: string };
      };

      if (response.code === 200 && response.data?.videoUrl) {
        return {
          hd_video_url: response.data.videoUrl,
          hd_available: true,
          hd_processing: false,
        };
      }

      if (response.code === 400 && response.msg?.includes('1080P')) {
        // 1080P still processing
        return {
          hd_available: false,
          hd_processing: true,
        };
      }

      // 1080P not available or other error
      return {
        hd_available: false,
        hd_processing: false,
      };
    } catch (error) {
      console.warn(
        '1080P retrieval failed:',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return {
        hd_available: false,
        hd_processing: false,
      };
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
        };
      }

      const rawData = statusResult.raw_data as
        | {
            response?: { resultUrls?: string[] };
          }
        | undefined;
      const videoUrl = rawData?.response?.resultUrls?.[0] || null;

      const baseResult: VideoGenerationResult = {
        request_id: requestId,
        status: 'COMPLETED',
        video_url: videoUrl,
        data: rawData,
      };

      // Try to get 1080P version
      const hd1080Result = await this.get1080P(requestId);

      return {
        ...baseResult,
        hd_video_url: hd1080Result.hd_video_url,
        hd_available: hd1080Result.hd_available,
        hd_processing: hd1080Result.hd_processing,
      };
    } catch (error) {
      throw new Error(
        `Kie.ai result retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
