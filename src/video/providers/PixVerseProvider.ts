import { getStorageProvider } from '@/storage';
import { PIXVERSE_CONFIG } from '../config/pixverse';
import {
  type VideoGenerationRequest,
  type VideoGenerationResponse,
  type VideoGenerationResult,
  type VideoGenerationStatus,
  VideoGenerationStatusEnum,
  type VideoProvider,
} from '../types';
import {
  type PixVerseGenerateResponse,
  PixVerseStatus,
  type PixVerseStatusResponse,
  type PixVerseUploadResponse,
} from '../types/video-effect';

/**
 * PixVerse Video Effects Provider
 * Implements the standard VideoProvider interface for consistency
 */
export class PixVerseProvider implements VideoProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('PixVerse API key is required');
    }
    this.apiKey = apiKey;
  }

  getName(): string {
    return 'pixverse';
  }

  /**
   * Make authenticated request to PixVerse API
   */
  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown,
    contentType = 'application/json'
  ): Promise<T> {
    const url = `${PIXVERSE_CONFIG.API_BASE}${endpoint}`;

    const headers: Record<string, string> = {
      'API-KEY': this.apiKey,
      'Ai-trace-id': PIXVERSE_CONFIG.generateTraceId(
        method === 'POST' ? 'gen' : 'status'
      ),
    };

    if (contentType === 'application/json') {
      headers['Content-Type'] = 'application/json';
    }

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(120000),
    };

    if (body && method === 'POST') {
      if (contentType === 'application/json') {
        options.body = JSON.stringify(body);
      } else {
        options.body = body as BodyInit;
        headers['Content-Type'] = contentType;
      }
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `PixVerse API error: ${response.status} ${response.statusText}. Response: ${errorText}`
      );
    }

    return response.json();
  }

  /**
   * Upload image to PixVerse
   */
  async uploadImage(
    imageBuffer: Buffer,
    filename = 'image.jpg'
  ): Promise<{ imgId: number; imgUrl: string }> {
    const boundary =
      '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

    const body = Buffer.concat([
      Buffer.from(`------${boundary}\r\n`, 'utf-8'),
      Buffer.from(
        `Content-Disposition: form-data; name="image"; filename="${filename}"\r\n`,
        'utf-8'
      ),
      Buffer.from('Content-Type: image/jpeg\r\n\r\n', 'utf-8'),
      imageBuffer,
      Buffer.from(`\r\n------${boundary}--\r\n`, 'utf-8'),
    ]);

    const url = `${PIXVERSE_CONFIG.API_BASE}${PIXVERSE_CONFIG.ENDPOINTS.IMAGE_UPLOAD}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'API-KEY': this.apiKey,
        'Ai-trace-id': PIXVERSE_CONFIG.generateTraceId('upload'),
        'Content-Type': `multipart/form-data; boundary=----${boundary}`,
      },
      body,
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Image upload failed: ${response.status} ${response.statusText}. Response: ${responseText}`
      );
    }

    let result: PixVerseUploadResponse;
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(`Failed to parse PixVerse response: ${responseText}`);
    }

    if (result.ErrCode !== 0 || !result.Resp?.img_id) {
      throw new Error(
        `Image upload failed: ${result.ErrMsg || 'Unknown error'}`
      );
    }

    return {
      imgId: result.Resp.img_id,
      imgUrl: result.Resp.img_url || '',
    };
  }

  /**
   * Download image from URL and upload to PixVerse
   */
  async uploadImageFromUrl(
    imageUrl: string
  ): Promise<{ imgId: number; imgUrl: string }> {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status}`);
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    const urlParts = imageUrl.split('/');
    const filename = urlParts[urlParts.length - 1] || 'download.jpg';

    return this.uploadImage(imageBuffer, filename);
  }

  /**
   * Submit video generation request
   */
  async submit(
    model: string,
    input: VideoGenerationRequest,
    _webhookUrl?: string
  ): Promise<VideoGenerationResponse> {
    // PixVerse requires template_id for effect-based generation
    const templateId = (input as { template_id?: number }).template_id;
    const imgIds = (input as { img_ids?: number[] }).img_ids || [];

    if (!templateId) {
      throw new Error('PixVerse requires template_id for video generation');
    }

    if (imgIds.length === 0) {
      throw new Error('PixVerse requires at least one image ID');
    }

    const generatePayload: Record<string, unknown> = {
      duration: input.duration || PIXVERSE_CONFIG.DEFAULTS.DURATION,
      model: PIXVERSE_CONFIG.DEFAULTS.MODEL,
      motion_mode: PIXVERSE_CONFIG.DEFAULTS.MOTION_MODE,
      template_id: templateId,
      prompt: input.prompt,
      quality:
        (input as { quality?: string }).quality ||
        PIXVERSE_CONFIG.DEFAULTS.QUALITY,
    };

    // Use correct parameter name based on image count
    if (imgIds.length === 1) {
      generatePayload.img_id = imgIds[0];
    } else {
      generatePayload.img_ids = imgIds;
    }

    console.log('PixVerse generate payload:', generatePayload);

    const result = await this.makeRequest<PixVerseGenerateResponse>(
      PIXVERSE_CONFIG.ENDPOINTS.VIDEO_GENERATE,
      'POST',
      generatePayload
    );

    if (result.ErrCode !== 0 || !result.Resp?.video_id) {
      throw new Error(
        `Video generation failed: ${result.ErrMsg || 'Unknown error'}`
      );
    }

    return {
      request_id: result.Resp.video_id.toString(),
      status: 'submitted',
      model,
      task_id: result.Resp.video_id.toString(),
      raw_response: result,
    };
  }

  /**
   * Check video generation status
   */
  async status(
    _model: string,
    requestId: string
  ): Promise<VideoGenerationStatus> {
    const result = await this.makeRequest<PixVerseStatusResponse>(
      `${PIXVERSE_CONFIG.ENDPOINTS.VIDEO_RESULT}/${requestId}`,
      'GET'
    );

    if (result.ErrCode !== 0) {
      throw new Error(result.ErrMsg || 'Unknown PixVerse error');
    }

    const pixverseData = result.Resp;
    if (!pixverseData) {
      throw new Error('No response data from PixVerse');
    }

    const mappedStatus = this.mapStatusToEnum(pixverseData.status);

    return {
      request_id: requestId,
      status: mappedStatus,
      progress: mappedStatus === VideoGenerationStatusEnum.COMPLETED ? 100 : 50,
      raw_data: pixverseData,
      error_message: this.getErrorMessage(pixverseData.status),
    };
  }

  /**
   * Get video generation result
   */
  async result(
    _model: string,
    requestId: string
  ): Promise<VideoGenerationResult> {
    const statusResult = await this.status(_model, requestId);

    if (statusResult.status !== VideoGenerationStatusEnum.COMPLETED) {
      return {
        request_id: requestId,
        status: statusResult.status,
        error_message: statusResult.error_message,
        data: statusResult.raw_data,
      };
    }

    const rawData = statusResult.raw_data as { url?: string } | undefined;

    return {
      request_id: requestId,
      status: VideoGenerationStatusEnum.COMPLETED,
      video_url: rawData?.url || null,
      data: rawData,
    };
  }

  /**
   * Sync status and optionally upload to R2
   */
  async syncStatusWithR2(
    videoGenerationId: string,
    requestId: string,
    currentVideoUrlR2?: string | null
  ): Promise<{
    status: VideoGenerationStatusEnum;
    videoUrl?: string;
    videoUrlR2?: string;
    errorMessage?: string;
  }> {
    const result = await this.result('', requestId);
    const mappedStatus = result.status as VideoGenerationStatusEnum;

    const response: {
      status: VideoGenerationStatusEnum;
      videoUrl?: string;
      videoUrlR2?: string;
      errorMessage?: string;
    } = {
      status: mappedStatus,
      videoUrl: result.video_url || undefined,
      errorMessage: result.error_message,
    };

    // Upload to R2 if completed and not already uploaded
    if (
      mappedStatus === VideoGenerationStatusEnum.COMPLETED &&
      result.video_url &&
      !currentVideoUrlR2
    ) {
      try {
        console.log('Uploading PixVerse video to R2');
        const storage = getStorageProvider();
        const fileName = `generated/videos/${videoGenerationId}-pixverse.mp4`;

        const uploadResult = await storage.downloadAndUpload({
          url: result.video_url,
          key: fileName,
          contentType: 'video/mp4',
        });

        if (uploadResult?.url) {
          response.videoUrlR2 = uploadResult.url;
          response.status = VideoGenerationStatusEnum.SAVED_TO_R2;
          console.log(`PixVerse video uploaded to R2: ${uploadResult.url}`);
        }
      } catch (r2Error) {
        console.error('PixVerse R2 upload failed:', r2Error);
      }
    }

    return response;
  }

  /**
   * Map PixVerse status code to VideoGenerationStatusEnum
   */
  private mapStatusToEnum(pixverseStatus: number): VideoGenerationStatusEnum {
    switch (pixverseStatus) {
      case PixVerseStatus.Completed:
        return VideoGenerationStatusEnum.COMPLETED;
      case PixVerseStatus.Processing:
        return VideoGenerationStatusEnum.IN_PROGRESS;
      case PixVerseStatus.Deleted:
      case PixVerseStatus.ModerationFailed:
      case PixVerseStatus.Failed:
        return VideoGenerationStatusEnum.FAILED;
      default:
        return VideoGenerationStatusEnum.IN_PROGRESS;
    }
  }

  /**
   * Get error message for failed status
   */
  private getErrorMessage(pixverseStatus: number): string | undefined {
    const errorMessages: Record<number, string> = {
      [PixVerseStatus.Deleted]: 'Video was deleted',
      [PixVerseStatus.ModerationFailed]: 'Content moderation failed',
      [PixVerseStatus.Failed]: 'Video generation failed',
    };
    return errorMessages[pixverseStatus];
  }
}

// Factory function to get PixVerse provider instance
let pixverseProviderInstance: PixVerseProvider | null = null;

export function getPixVerseProvider(): PixVerseProvider {
  if (!pixverseProviderInstance) {
    const apiKey = process.env.PIXVERSE_API_KEY;
    if (!apiKey) {
      throw new Error('PIXVERSE_API_KEY is not configured');
    }
    pixverseProviderInstance = new PixVerseProvider(apiKey);
  }
  return pixverseProviderInstance;
}

export function clearPixVerseProviderCache(): void {
  pixverseProviderInstance = null;
}
