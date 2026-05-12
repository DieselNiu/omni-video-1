/**
 * Vertex AI Nano Banana Image Generation Provider
 * Uses Google Cloud Vertex AI for production-grade image generation
 * Supports gemini-2.5-flash-image (Nano Banana) and gemini-3-pro-image-preview (Nano Banana Pro)
 */

import type { ImageExecutableModel } from '@/models/types';
import { GoogleAuth } from 'google-auth-library';
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageGenerationResult,
  ImageGenerationStatus,
  ImageProvider,
} from '../types';

export interface VertexAIConfig {
  projectId: string;
  location: string;
  keyFilePath: string;
}

export class VertexAINanoBananaProvider implements ImageProvider {
  private auth: GoogleAuth;
  private projectId: string;
  private location: string;

  constructor(config: VertexAIConfig) {
    if (!config.projectId) {
      throw new Error(
        'GOOGLE_CLOUD_PROJECT is required for Vertex AI Provider'
      );
    }
    this.projectId = config.projectId;
    this.location = config.location || 'us-central1';
    this.auth = new GoogleAuth({
      keyFilename: config.keyFilePath,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }

  getName(): string {
    return 'vertex-nano-banana';
  }

  /**
   * Get the Vertex AI endpoint for a model
   * Uses global endpoint as per official documentation
   */
  private getEndpoint(modelName: string): string {
    // Gemini image models use the global endpoint per official docs
    // https://console.cloud.google.com/vertex-ai/publishers/google/model-garden/gemini-3-pro-image-preview
    return `https://aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/global/publishers/google/models/${modelName}:generateContent`;
  }

  /**
   * Map an executable's apiModelId to the Google Vertex model id. When the
   * registered apiModelId is already a Gemini model path (`gemini-*`), pass
   * it through as-is. Otherwise translate the legacy 'nano-banana*' strings
   * — eventually Phase 4 cleanup will have callers register real Gemini ids
   * in `binding.apiModelId` and this helper disappears.
   */
  private getGoogleModelName(apiModelId: string): string {
    if (apiModelId.startsWith('gemini-')) return apiModelId;
    if (apiModelId === 'nano-banana-pro' || apiModelId === 'nano-banana-2') {
      return 'gemini-3-pro-image-preview';
    }
    return 'gemini-2.5-flash-image';
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
   * Fetch an image from URL and convert to base64
   */
  private async fetchImageAsBase64(
    url: string
  ): Promise<{ base64: string; mimeType: string }> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${url}`);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return {
      base64,
      mimeType: contentType,
    };
  }

  async submit(
    executable: ImageExecutableModel,
    input: ImageGenerationRequest
  ): Promise<ImageGenerationResponse> {
    const googleModel = this.getGoogleModelName(executable.binding.apiModelId);
    const endpoint = this.getEndpoint(googleModel);

    console.log(
      `[VertexAINanoBanana] Using model: ${googleModel} for executable ${executable.id}`
    );
    console.log(`[VertexAINanoBanana] Endpoint: ${endpoint}`);

    try {
      const accessToken = await this.getAccessToken();

      // Build content parts
      const parts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];

      // Add prompt text
      parts.push({ text: input.prompt });

      // Add input images if provided (for image-to-image / editing)
      if (input.image_urls && input.image_urls.length > 0) {
        for (const imageUrl of input.image_urls) {
          const imageData = await this.fetchImageAsBase64(imageUrl);
          parts.push({
            inlineData: {
              mimeType: imageData.mimeType,
              data: imageData.base64,
            },
          });
        }
      }

      // Build request body for Vertex AI
      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: parts,
          },
        ],
        generationConfig: {
          // Must be uppercase per official Vertex AI documentation
          responseModalities: ['TEXT', 'IMAGE'],
        },
      };

      console.log('[VertexAINanoBanana] Sending request...');

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[VertexAINanoBanana] API Error:', errorText);
        throw new Error(
          `Vertex AI API Error: ${response.status} - ${errorText}`
        );
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string;
              inlineData?: {
                mimeType: string;
                data: string;
              };
            }>;
          };
        }>;
      };

      // Extract image from response
      const candidates = data.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error('No candidates returned from Vertex AI');
      }

      const parts_response = candidates[0].content?.parts;
      if (!parts_response || parts_response.length === 0) {
        throw new Error('No content parts returned from Vertex AI');
      }

      // Find image data in response
      let imageBase64: string | null = null;
      let textResponse: string | null = null;

      for (const part of parts_response) {
        if (part.inlineData) {
          imageBase64 = part.inlineData.data;
        } else if (part.text) {
          textResponse = part.text;
        }
      }

      if (!imageBase64) {
        throw new Error(
          `No image generated. Text response: ${textResponse || 'No response'}`
        );
      }

      // Generate a unique request ID
      const requestId = `vertex-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      console.log('[VertexAINanoBanana] Image generated successfully');

      return {
        request_id: requestId,
        status: 'completed',
        model: executable.id,
        raw_response: {
          imageBase64,
          textResponse,
          provider: 'vertex',
        },
      };
    } catch (error) {
      console.error('[VertexAINanoBanana] Generation failed:', error);
      throw error;
    }
  }

  /**
   * Get the base64 image data from a completed response
   */
  getImageBase64FromResponse(response: ImageGenerationResponse): string | null {
    const rawResponse = response.raw_response as
      | {
          imageBase64?: string;
        }
      | undefined;
    return rawResponse?.imageBase64 || null;
  }

  // Vertex AI is synchronous - returns completed result immediately
  async status(
    _model: string,
    requestId: string
  ): Promise<ImageGenerationStatus> {
    return {
      request_id: requestId,
      status: 'completed',
      raw_data: { message: 'Vertex AI returns results synchronously' },
    };
  }

  // Vertex AI is synchronous - result is already in submit response
  async result(
    _model: string,
    requestId: string
  ): Promise<ImageGenerationResult> {
    return {
      request_id: requestId,
      status: 'completed',
      data: { message: 'Result already returned in submit response' },
    };
  }
}
