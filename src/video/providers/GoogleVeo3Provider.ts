import type {
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoGenerationResult,
  VideoGenerationStatus,
  VideoProvider,
} from '../types';

/**
 * Google Official Veo 3.1 Provider
 * Uses the Gemini API for video generation
 *
 * API Documentation: https://ai.google.dev/gemini-api/docs/video
 *
 * Key differences from third-party providers:
 * - Uses async polling model (operation.done)
 * - Supports 720p, 1080p, 4k resolutions
 * - Supports 4s, 6s, 8s durations
 * - Native audio generation
 * - Video extension capability (Veo 3.1 only)
 * - Reference images support (up to 3 images)
 * - First/last frame interpolation
 */
export class GoogleVeo3Provider implements VideoProvider {
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error(
        'GOOGLE_GENERATIVE_AI_API_KEY is required for Google Veo3 Provider'
      );
    }
    this.apiKey = apiKey;
  }

  getName(): string {
    return 'google-veo3';
  }

  /**
   * Make a request to the Gemini API
   */
  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown
  ): Promise<unknown> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'x-goog-api-key': this.apiKey,
      'Content-Type': 'application/json',
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
      let errorData: { error?: { message?: string; status?: string } };
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: { message: errorText } };
      }

      const errorMessage =
        errorData.error?.message ||
        errorText ||
        `API Error: ${response.status}`;
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * Convert image URL to base64 inline data format for Gemini API
   */
  private async urlToInlineData(
    imageUrl: string
  ): Promise<{ inlineData: { mimeType: string; data: string } }> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${imageUrl}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Detect MIME type from response or URL
    const contentType = response.headers.get('content-type') || 'image/png';
    const mimeType = contentType.split(';')[0].trim();

    return {
      inlineData: {
        mimeType,
        data: base64,
      },
    };
  }

  /**
   * Get the model ID
   * veo-3.1-generate-preview: Standard version with all features
   * veo-3.1-fast-generate-preview: Faster version (not used currently, frontend defaults to 1080p)
   */
  private getModelId(_input: VideoGenerationRequest): string {
    // Always use standard version since frontend defaults to 1080p
    return 'veo-3.1-generate-preview';
  }

  /**
   * Submit a video generation request
   * Returns an operation name that can be polled for status
   */
  async submit(
    model: string,
    input: VideoGenerationRequest,
    _webhookUrl?: string
  ): Promise<VideoGenerationResponse> {
    try {
      const modelId = this.getModelId(input);
      const endpoint = `/models/${modelId}:predictLongRunning`;

      // Build the instance object
      const instance: Record<string, unknown> = {
        prompt: input.prompt,
      };

      // Handle image input (first frame)
      if (input.image_url) {
        instance.image = await this.urlToInlineData(input.image_url);
      } else if (input.image_urls && input.image_urls.length > 0) {
        // First image is the starting frame
        instance.image = await this.urlToInlineData(input.image_urls[0]);
      }

      // Build parameters
      const parameters: Record<string, unknown> = {};

      // Aspect ratio - official API uses "16:9" or "9:16"
      const aspectRatio = input.aspect_ratio || input.aspectRatio;
      if (aspectRatio && aspectRatio !== 'Auto') {
        parameters.aspectRatio = aspectRatio;
      }

      // Resolution (720p, 1080p, 4k) - keep original case
      if (input.resolution) {
        // API expects lowercase: "720p", "1080p", "4k"
        parameters.resolution = input.resolution.toLowerCase();
      }

      // Duration - only set for non-default values
      // Default is 8 seconds, so only pass if different
      // Note: 1080p and 4k only support 8s duration
      if (input.duration) {
        const durationNum =
          typeof input.duration === 'string'
            ? Number.parseInt(input.duration, 10)
            : input.duration;
        // Only set if it's a valid Veo duration and not 8 (default)
        // Also skip if using high resolution which requires 8s
        const resolution = input.resolution?.toLowerCase();
        const isHighRes = resolution === '1080p' || resolution === '4k';
        if ([4, 6].includes(durationNum) && !isHighRes) {
          parameters.durationSeconds = durationNum;
        }
        // For 8 seconds, don't pass the parameter - use default
      }

      // Negative prompt
      if (input.negative_prompt) {
        parameters.negativePrompt = input.negative_prompt;
      }

      // Seed for reproducibility
      if (input.seed) {
        parameters.seed = input.seed;
      }

      // Handle reference images (Veo 3.1 feature)
      if (
        input.generationType === 'REFERENCE_2_VIDEO' &&
        input.image_urls &&
        input.image_urls.length > 0
      ) {
        const referenceImages = await Promise.all(
          input.image_urls.slice(0, 3).map(async (url) => ({
            image: await this.urlToInlineData(url),
            referenceType: 'asset',
          }))
        );
        parameters.referenceImages = referenceImages;
        // Reference images require 8 second duration
        parameters.durationSeconds = 8;
      }

      // Handle first and last frame interpolation
      if (
        input.generationType === 'FIRST_AND_LAST_FRAMES_2_VIDEO' &&
        input.image_urls &&
        input.image_urls.length >= 2
      ) {
        // First image is set as instance.image above
        // Second image is the last frame
        parameters.lastFrame = await this.urlToInlineData(input.image_urls[1]);
      }

      const requestBody = {
        instances: [instance],
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      };

      console.log(
        'Google Veo3 video generation request:',
        JSON.stringify(
          {
            endpoint,
            prompt: input.prompt,
            hasImage: !!instance.image,
            parameters,
          },
          null,
          2
        )
      );

      const response = (await this.makeRequest(
        endpoint,
        'POST',
        requestBody
      )) as {
        name: string;
        metadata?: unknown;
      };

      console.log(
        'Google Veo3 submit response:',
        JSON.stringify({ name: response.name }, null, 2)
      );

      if (!response.name) {
        throw new Error('No operation name received from Google API');
      }

      return {
        request_id: response.name,
        status: 'submitted',
        model: model,
        task_id: response.name,
        raw_response: response,
      };
    } catch (error) {
      throw new Error(
        `Google Veo3 Provider submit failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check the status of a video generation request
   * Polls the operation endpoint until done
   */
  async status(
    _model: string,
    requestId: string
  ): Promise<VideoGenerationStatus> {
    try {
      // The requestId is the full operation name like "operations/xxx"
      const endpoint = requestId.startsWith('/') ? requestId : `/${requestId}`;

      const response = (await this.makeRequest(endpoint, 'GET')) as {
        name: string;
        done?: boolean;
        error?: {
          code: number;
          message: string;
          status: string;
        };
        metadata?: unknown;
        response?: {
          generateVideoResponse?: {
            generatedSamples?: Array<{
              video?: {
                uri?: string;
              };
            }>;
          };
        };
      };

      // Check for error
      if (response.error) {
        return {
          request_id: requestId,
          status: 'FAILED',
          progress: 0,
          error_message: response.error.message || 'Video generation failed',
          raw_data: response,
        };
      }

      // Check if done
      if (response.done) {
        return {
          request_id: requestId,
          status: 'COMPLETED',
          progress: 100,
          raw_data: response,
        };
      }

      // Still in progress
      return {
        request_id: requestId,
        status: 'IN_PROGRESS',
        progress: 50, // Google API doesn't provide progress percentage
        raw_data: response,
      };
    } catch (error) {
      throw new Error(
        `Google Veo3 status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get the result of a completed video generation request
   */
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
          error_message: statusResult.error_message,
          data: statusResult.raw_data,
        };
      }

      // Extract video URL from the response
      const rawData = statusResult.raw_data as {
        response?: {
          generateVideoResponse?: {
            generatedSamples?: Array<{
              video?: {
                uri?: string;
              };
            }>;
          };
        };
      };

      const videoUri =
        rawData?.response?.generateVideoResponse?.generatedSamples?.[0]?.video
          ?.uri;

      if (!videoUri) {
        return {
          request_id: requestId,
          status: 'FAILED',
          error_message: 'No video URL in response',
          data: rawData,
        };
      }

      // The video URI requires the API key to download
      // Append the API key as a query parameter for direct access
      const videoUrl = videoUri.includes('?')
        ? `${videoUri}&key=${this.apiKey}`
        : `${videoUri}?key=${this.apiKey}`;

      return {
        request_id: requestId,
        status: 'COMPLETED',
        video_url: videoUrl,
        data: rawData,
      };
    } catch (error) {
      throw new Error(
        `Google Veo3 result retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
