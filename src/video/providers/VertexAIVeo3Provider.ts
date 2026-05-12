/**
 * Vertex AI Veo 3.1 Video Generation Provider
 * Uses Google Cloud Vertex AI for production-grade video generation
 *
 * Key differences from GoogleVeo3Provider (AI Studio):
 * - Uses Service Account authentication instead of API key
 * - Uses Vertex AI endpoint instead of Gemini API endpoint
 * - Same async polling model (operation.done)
 */

import { S3Provider } from '@/storage/provider/s3';
import { GoogleAuth } from 'google-auth-library';
import type {
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoGenerationResult,
  VideoGenerationStatus,
  VideoProvider,
} from '../types';

export interface VertexAIVideoConfig {
  projectId: string;
  location: string;
  keyFilePath: string;
}

export class VertexAIVeo3Provider implements VideoProvider {
  private auth: GoogleAuth;
  private s3Provider: S3Provider;
  private projectId: string;
  private location: string;
  private baseUrl: string;

  constructor(config: VertexAIVideoConfig) {
    if (!config.projectId) {
      throw new Error(
        'GOOGLE_CLOUD_PROJECT is required for Vertex AI Veo3 Provider'
      );
    }
    this.projectId = config.projectId;
    this.location = config.location || 'us-central1';
    this.baseUrl = `https://${this.location}-aiplatform.googleapis.com/v1`;
    this.auth = new GoogleAuth({
      keyFilename: config.keyFilePath,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.s3Provider = new S3Provider();
  }

  getName(): string {
    return 'vertex-veo3';
  }

  /**
   * Get access token from Service Account
   */
  private async getAccessToken(): Promise<string> {
    const client = await this.auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) {
      throw new Error('Failed to get access token from Service Account');
    }
    return tokenResponse.token;
  }

  /**
   * Make a request to the Vertex AI API
   */
  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown
  ): Promise<unknown> {
    const accessToken = await this.getAccessToken();
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
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
   * Convert image URL to Vertex AI image format
   * Vertex AI Video uses bytesBase64Encoded format (NOT inlineData like Gemini API)
   */
  private async urlToVertexImage(
    imageUrl: string
  ): Promise<{ bytesBase64Encoded: string; mimeType: string }> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${imageUrl}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const contentType = response.headers.get('content-type') || 'image/png';
    const mimeType = contentType.split(';')[0].trim();

    return {
      bytesBase64Encoded: base64,
      mimeType,
    };
  }

  /**
   * Get the model ID based on input parameters
   * Per official docs: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos-from-text
   * Supported models:
   * - veo-3.1-generate-001 (standard quality, higher cost)
   * - veo-3.1-fast-generate-001 (faster generation, lower cost)
   *
   * TODO: In the future, we may want to use different models for different users
   * e.g., premium users get standard quality, free users get fast model
   */
  private getModelId(_input: VideoGenerationRequest): string {
    // Use fast model by default to reduce costs
    return 'veo-3.1-fast-generate-001';
  }

  /**
   * Get the Vertex AI endpoint for video generation
   */
  private getModelEndpoint(modelId: string): string {
    return `/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${modelId}:predictLongRunning`;
  }

  /**
   * Submit a video generation request
   */
  async submit(
    model: string,
    input: VideoGenerationRequest,
    _webhookUrl?: string
  ): Promise<VideoGenerationResponse> {
    try {
      const modelId = this.getModelId(input);
      const endpoint = this.getModelEndpoint(modelId);

      // Build the instance object
      const instance: Record<string, unknown> = {
        prompt: input.prompt,
      };

      // Handle image input based on generation type
      // Reference mode uses referenceImages in instance, NOT instance.image
      if (input.generationType !== 'REFERENCE_2_VIDEO') {
        // For image-to-video and first-last-frame modes, set first frame image
        if (input.image_url) {
          instance.image = await this.urlToVertexImage(input.image_url);
        } else if (input.image_urls && input.image_urls.length > 0) {
          instance.image = await this.urlToVertexImage(input.image_urls[0]);
        }
      }

      // Build parameters
      const parameters: Record<string, unknown> = {};

      // Aspect ratio
      const aspectRatio = input.aspect_ratio || input.aspectRatio;
      if (aspectRatio && aspectRatio !== 'Auto') {
        parameters.aspectRatio = aspectRatio;
      }

      // Resolution
      if (input.resolution) {
        parameters.resolution = input.resolution.toLowerCase();
      }

      // Duration
      if (input.duration) {
        const durationNum =
          typeof input.duration === 'string'
            ? Number.parseInt(input.duration, 10)
            : input.duration;
        const resolution = input.resolution?.toLowerCase();
        const isHighRes = resolution === '1080p' || resolution === '4k';
        if ([4, 6].includes(durationNum) && !isHighRes) {
          parameters.durationSeconds = durationNum;
        }
      }

      // Negative prompt
      if (input.negative_prompt) {
        parameters.negativePrompt = input.negative_prompt;
      }

      // Seed
      if (input.seed) {
        parameters.seed = input.seed;
      }

      // Handle reference images (Veo 3.1 feature) - goes in INSTANCE, not parameters
      // Per official docs: referenceImages is part of the instance object
      if (
        input.generationType === 'REFERENCE_2_VIDEO' &&
        input.image_urls &&
        input.image_urls.length > 0
      ) {
        const referenceImages = await Promise.all(
          input.image_urls.slice(0, 3).map(async (url) => ({
            image: await this.urlToVertexImage(url),
            referenceType: 'asset',
          }))
        );
        instance.referenceImages = referenceImages;
        parameters.durationSeconds = 8;
      }

      // Handle first and last frame interpolation - uses Vertex AI bytesBase64Encoded format
      // First frame goes in instance.image (already set above), last frame goes in parameters.lastFrame
      if (
        input.generationType === 'FIRST_AND_LAST_FRAMES_2_VIDEO' &&
        input.image_urls &&
        input.image_urls.length >= 2
      ) {
        parameters.lastFrame = await this.urlToVertexImage(input.image_urls[1]);
      }

      const requestBody = {
        instances: [instance],
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      };

      console.log(
        '[VertexAIVeo3] Video generation request:',
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
        '[VertexAIVeo3] Submit response:',
        JSON.stringify({ name: response.name }, null, 2)
      );

      if (!response.name) {
        throw new Error('No operation name received from Vertex AI');
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
        `Vertex AI Veo3 Provider submit failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check the status of a video generation request
   * Per official docs, use POST to :fetchPredictOperation endpoint
   */
  async status(
    _model: string,
    requestId: string
  ): Promise<VideoGenerationStatus> {
    try {
      // The requestId is the full operation name like "projects/.../operations/xxx"
      // Per docs: POST to :fetchPredictOperation with operationName in body
      // Extract model ID from the operation name
      const modelIdMatch = requestId.match(/models\/([^/]+)\/operations/);
      const modelId = modelIdMatch ? modelIdMatch[1] : 'veo-3.1-generate-001';

      const fetchEndpoint = `/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${modelId}:fetchPredictOperation`;

      const requestBody = {
        operationName: requestId,
      };

      const response = (await this.makeRequest(
        fetchEndpoint,
        'POST',
        requestBody
      )) as {
        name: string;
        done?: boolean;
        error?: {
          code: number;
          message: string;
          status: string;
        };
        metadata?: unknown;
        response?: {
          predictions?: Array<{
            bytesBase64Encoded?: string;
            mimeType?: string;
          }>;
        };
      };

      // Log the full response for debugging
      console.log(
        '[VertexAIVeo3] Status check FULL response:',
        JSON.stringify(response, null, 2)
      );

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
        progress: 50,
        raw_data: response,
      };
    } catch (error) {
      throw new Error(
        `Vertex AI Veo3 status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Upload base64 video content to Cloudflare R2 and return the public URL
   * R2 is cheaper and has built-in CDN, better for serving video content
   */
  private async uploadBase64ToR2(
    base64Content: string,
    mimeType: string
  ): Promise<string> {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    const extension = mimeType === 'video/mp4' ? 'mp4' : 'webm';
    const key = `videos/${timestamp}-${randomId}/video.${extension}`;

    const buffer = Buffer.from(base64Content, 'base64');

    const result = await this.s3Provider.upload(key, buffer, mimeType);

    console.log('[VertexAIVeo3] Uploaded base64 video to R2:', result.url);
    return result.url;
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

      // Extract video from the response - expects predictions array with base64 format
      const rawData = statusResult.raw_data as {
        response?: {
          predictions?: Array<{
            bytesBase64Encoded?: string;
            mimeType?: string;
          }>;
        };
      };

      const videoData = rawData?.response?.predictions?.[0];

      if (!videoData) {
        return {
          request_id: requestId,
          status: 'FAILED',
          error_message: 'No video data in response',
          data: rawData,
        };
      }

      // Handle base64 encoded format - upload to R2 directly (cheaper + CDN)
      if (!videoData.bytesBase64Encoded) {
        return {
          request_id: requestId,
          status: 'FAILED',
          error_message: 'No base64 video content in response',
          data: rawData,
        };
      }

      console.log(
        '[VertexAIVeo3] Video returned as base64, uploading to R2...'
      );
      const mimeType = videoData.mimeType || 'video/mp4';
      const accessibleUrl = await this.uploadBase64ToR2(
        videoData.bytesBase64Encoded,
        mimeType
      );

      return {
        request_id: requestId,
        status: 'COMPLETED',
        video_url: accessibleUrl,
        data: rawData,
      };
    } catch (error) {
      throw new Error(
        `Vertex AI Veo3 result retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
