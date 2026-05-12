/**
 * Google Nano Banana AI Image Generation Provider
 * Directly integrates with Google's Gemini API for image generation
 * Uses gemini-2.5-flash-image (Nano Banana) or gemini-3-pro-image-preview (Nano Banana Pro)
 */

import type { ImageExecutableModel } from '@/models/types';
import { GoogleGenAI } from '@google/genai';
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageGenerationResult,
  ImageGenerationStatus,
  ImageProvider,
} from '../types';

export class GoogleNanoBananaProvider implements ImageProvider {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Google Generative AI API key is required');
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  getName(): string {
    return 'google-nano-banana';
  }

  /**
   * Map an executable's apiModelId to the Google Gemini model id. When the
   * registered apiModelId already starts with `gemini-`, use it verbatim.
   * Otherwise translate legacy 'nano-banana*' strings for backward compat.
   */
  private getGoogleModelName(apiModelId: string): string {
    if (apiModelId.startsWith('gemini-')) return apiModelId;
    if (apiModelId === 'nano-banana-pro' || apiModelId === 'nano-banana-2') {
      return 'gemini-3-pro-image-preview';
    }
    return 'gemini-2.5-flash-image';
  }

  async submit(
    executable: ImageExecutableModel,
    input: ImageGenerationRequest
  ): Promise<ImageGenerationResponse> {
    const googleModel = this.getGoogleModelName(executable.binding.apiModelId);
    console.log(
      `[GoogleNanoBanana] Using model: ${googleModel} for executable ${executable.id}`
    );

    try {
      // Build content array based on whether we have input images
      const contents: Array<
        string | { inlineData: { mimeType: string; data: string } }
      > = [];

      // Add prompt text
      contents.push(input.prompt);

      // Add input images if provided (for image-to-image / editing)
      if (input.image_urls && input.image_urls.length > 0) {
        for (const imageUrl of input.image_urls) {
          // Fetch image and convert to base64
          const imageData = await this.fetchImageAsBase64(imageUrl);
          contents.push({
            inlineData: {
              mimeType: imageData.mimeType,
              data: imageData.base64,
            },
          });
        }
      }

      // Generate image using Gemini API
      const response = await this.client.models.generateContent({
        model: googleModel,
        contents: contents,
      });

      // Extract image from response
      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error('No candidates returned from Google API');
      }

      const parts = candidates[0].content?.parts;
      if (!parts || parts.length === 0) {
        throw new Error('No content parts returned from Google API');
      }

      // Find image data in response
      let imageBase64: string | null = null;
      let textResponse: string | null = null;

      for (const part of parts) {
        if ('inlineData' in part && part.inlineData) {
          imageBase64 = part.inlineData.data || null;
        } else if ('text' in part && part.text) {
          textResponse = part.text;
        }
      }

      if (!imageBase64) {
        throw new Error(
          `No image generated. Text response: ${textResponse || 'No response'}`
        );
      }

      // Generate a unique request ID
      const requestId = `google-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      return {
        request_id: requestId,
        status: 'completed',
        model: executable.id,
        raw_response: {
          imageBase64,
          textResponse,
          provider: 'google',
        },
      };
    } catch (error) {
      console.error('[GoogleNanoBanana] Generation failed:', error);
      throw error;
    }
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

  // Google API is synchronous - returns completed result immediately
  async status(
    _model: string,
    requestId: string
  ): Promise<ImageGenerationStatus> {
    return {
      request_id: requestId,
      status: 'completed',
      raw_data: { message: 'Google API returns results synchronously' },
    };
  }

  // Google API is synchronous - result is already in submit response
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
