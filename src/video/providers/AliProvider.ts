import { getVideoModel } from '../config/video-models';
import type {
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoGenerationResult,
  VideoGenerationStatus,
  VideoProvider,
} from '../types';

export class AliProvider implements VideoProvider {
  // Singapore region (international endpoint)
  private baseUrl = 'https://dashscope-intl.aliyuncs.com';
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Ali API key is required');
    }
    this.apiKey = apiKey;
  }

  getName(): string {
    return 'ali';
  }

  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown
  ): Promise<unknown> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'X-DashScope-DataInspection': '{"input":"disable", "output":"disable"}',
    };

    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      headers['X-DashScope-Async'] = 'enable';
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const responseData = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const errorCode = responseData.code || 'Unknown';
      const errorMessage = responseData.message || response.statusText;
      throw new Error(`Ali API error: ${errorCode} - ${errorMessage}`);
    }

    return responseData;
  }

  private isWan26Model(aliModelId: string): boolean {
    return aliModelId.startsWith('wan2.6');
  }

  private isWan22Model(aliModelId: string): boolean {
    return aliModelId.startsWith('wan2.2');
  }

  private isImageToVideoModel(aliModelId: string): boolean {
    return aliModelId.includes('i2v');
  }

  // Check if model is a first-and-last-frame model (kf2v)
  private isFirstLastFrameModel(aliModelId: string): boolean {
    return aliModelId.includes('kf2v');
  }

  // Wan 2.7 instruction-driven video editor (model id `wan2.7-videoedit`).
  private isVideoEditModel(aliModelId: string): boolean {
    return aliModelId.includes('videoedit');
  }

  // Wan 2.7 multi-subject reference-to-video (model id `wan2.7-r2v`).
  private isReferenceToVideoModel(aliModelId: string): boolean {
    return aliModelId.includes('r2v');
  }

  // Get size string for Wan 2.6 T2V based on resolution and aspect ratio
  private getWan26T2VSize(resolution: string, aspectRatio: string): string {
    if (resolution === '1080p') {
      if (aspectRatio === '16:9') return '1920*1080';
      if (aspectRatio === '9:16') return '1080*1920';
      if (aspectRatio === '1:1') return '1080*1080';
      return '1920*1080';
    }
    // 720p
    if (aspectRatio === '16:9') return '1280*720';
    if (aspectRatio === '9:16') return '720*1280';
    if (aspectRatio === '1:1') return '720*720';
    return '1280*720';
  }

  // Get size string for Wan 2.2 T2V based on resolution and aspect ratio
  // Wan 2.2 supports 480P and 1080P tiers
  private getWan22T2VSize(resolution: string, aspectRatio: string): string {
    if (resolution === '1080p') {
      if (aspectRatio === '16:9') return '1920*1080';
      if (aspectRatio === '9:16') return '1080*1920';
      if (aspectRatio === '1:1') return '1440*1440';
      if (aspectRatio === '4:3') return '1632*1248';
      if (aspectRatio === '3:4') return '1248*1632';
      return '1920*1080';
    }
    // 480p
    if (aspectRatio === '16:9') return '832*480';
    if (aspectRatio === '9:16') return '480*832';
    if (aspectRatio === '1:1') return '624*624';
    return '832*480';
  }

  async submit(
    model: string,
    input: VideoGenerationRequest,
    _webhookUrl?: string
  ): Promise<VideoGenerationResponse> {
    // Get the actual Ali model ID from config
    const aliModelId = this.getAliModelId(model);
    const isWan26 = this.isWan26Model(aliModelId);
    const isWan22 = this.isWan22Model(aliModelId);
    const isI2V = this.isImageToVideoModel(aliModelId);
    const isKf2v = this.isFirstLastFrameModel(aliModelId);
    const isVideoEdit = this.isVideoEditModel(aliModelId);
    const isR2V = this.isReferenceToVideoModel(aliModelId);

    // Use different endpoint for first-and-last-frame model
    const endpoint = isKf2v
      ? '/api/v1/services/aigc/image2video/video-synthesis'
      : '/api/v1/services/aigc/video-generation/video-synthesis';

    // Build request body
    const requestBody: Record<string, unknown> = {
      model: aliModelId,
      input: {
        prompt: input.prompt,
      },
      parameters: {},
    };

    const inputObj = requestBody.input as Record<string, unknown>;
    const paramsObj = requestBody.parameters as Record<string, unknown>;

    // Handle negative prompt
    if (input.negative_prompt) {
      inputObj.negative_prompt = input.negative_prompt;
    }

    // Get resolution
    const resolution = String(input.resolution || '720p');
    const aspectRatio = input.aspect_ratio || '16:9';

    if (isR2V) {
      // Wan 2.7 reference-to-video. Builds a `media` array containing
      // reference_image / reference_video / first_frame entries plus an
      // optional reference_voice per entry. Reference audios are paired
      // sequentially with non-first_frame media entries (audio[0] →
      // first subject, audio[1] → second, ...).
      type MediaEntry = {
        type: 'reference_image' | 'reference_video' | 'first_frame';
        url: string;
        reference_voice?: string;
      };
      const media: MediaEntry[] = [];

      const imageUrls = input.image_urls ?? [];
      const imageRoles = (input.image_roles ?? []) as Array<
        'first_frame' | 'last_frame' | 'reference_image'
      >;
      for (let i = 0; i < imageUrls.length; i++) {
        const url = imageUrls[i];
        if (!url) continue;
        const role = imageRoles[i];
        const type: MediaEntry['type'] =
          role === 'first_frame' ? 'first_frame' : 'reference_image';
        media.push({ type, url });
      }

      const refVideos =
        (input as { referenceVideos?: string[] }).referenceVideos ?? [];
      for (const url of refVideos) {
        if (url) media.push({ type: 'reference_video', url });
      }

      // Pair reference_voice sequentially to non-first_frame entries
      // (image1, image2, …, video1, …). first_frame entries are skipped
      // since voice cloning targets the spoken subject.
      const refAudios =
        (input as { referenceAudios?: string[] }).referenceAudios ?? [];
      if (refAudios.length > 0) {
        let audioIdx = 0;
        for (const entry of media) {
          if (audioIdx >= refAudios.length) break;
          if (entry.type === 'first_frame') continue;
          const voice = refAudios[audioIdx];
          if (voice) entry.reference_voice = voice;
          audioIdx++;
        }
      }

      if (media.length === 0) {
        throw new Error(
          'wan2.7-r2v requires at least one reference image or video'
        );
      }

      // Ali spec: reference_image + reference_video ≤ 5. first_frame is
      // counted separately (max 1). Trim from the tail if the caller
      // over-supplied so we surface a clean request rather than a 4xx.
      const firstFrameEntries = media.filter((m) => m.type === 'first_frame');
      const refEntries = media.filter((m) => m.type !== 'first_frame');
      const trimmedRefs = refEntries.slice(0, 5);
      const trimmedFirstFrame = firstFrameEntries.slice(0, 1);
      inputObj.media = [...trimmedFirstFrame, ...trimmedRefs];

      paramsObj.resolution = this.normalizeResolution(resolution);
      if (aspectRatio && aspectRatio !== 'Auto') {
        paramsObj.ratio = aspectRatio;
      }
      if (typeof input.duration === 'number' && input.duration > 0) {
        paramsObj.duration = input.duration;
      }
      paramsObj.prompt_extend = input.prompt_extend ?? true;
      paramsObj.watermark = input.watermarkEnabled ?? false;
      if (typeof input.seed === 'number') {
        paramsObj.seed = input.seed;
      }
    } else if (isVideoEdit) {
      // Wan 2.7 video-edit. Expects `media` array with exactly one
      // `type: 'video'` entry (the editable source) plus up to 4
      // optional `type: 'reference_image'` entries.
      if (!input.video_url) {
        throw new Error('wan2.7-videoedit requires an input video_url');
      }
      const media: Array<{ type: string; url: string }> = [
        { type: 'video', url: input.video_url },
      ];
      const refs = input.image_urls?.slice(0, 4) ?? [];
      for (const url of refs) {
        if (url) media.push({ type: 'reference_image', url });
      }
      inputObj.media = media;

      paramsObj.resolution = this.normalizeResolution(resolution);
      // Only forward aspect ratio when the user picked an explicit one;
      // omitting it tells the API to mirror the input video's ratio.
      if (aspectRatio && aspectRatio !== 'Auto') {
        paramsObj.ratio = aspectRatio;
      }
      // duration=0 (default) tells the API to match the input video
      // length. Anything else truncates the input.
      if (typeof input.duration === 'number' && input.duration > 0) {
        paramsObj.duration = input.duration;
      }
      paramsObj.prompt_extend = input.prompt_extend ?? true;
      paramsObj.watermark = input.watermarkEnabled ?? false;
      if (typeof input.seed === 'number') {
        paramsObj.seed = input.seed;
      }
    } else if (isKf2v) {
      // First-and-last-frame model (wan2.2-kf2v-flash)
      // Requires two images: first_frame_url and last_frame_url
      if (input.image_urls && input.image_urls.length >= 2) {
        inputObj.first_frame_url = input.image_urls[0];
        inputObj.last_frame_url = input.image_urls[1];
      } else if (input.image_url) {
        // Fallback: if only one image provided, use it as first frame
        inputObj.first_frame_url = input.image_url;
        console.warn(
          'First-and-last-frame model requires 2 images, only 1 provided'
        );
      }

      // Resolution parameter (480P, 720P, or 1080P)
      paramsObj.resolution = this.normalizeResolution(resolution);

      // Prompt expansion (default to true)
      paramsObj.prompt_extend = input.prompt_extend ?? true;
    } else if (isWan26) {
      // Wan 2.6 parameters
      if (isI2V) {
        // I2V uses img_url and resolution parameter
        // Handle both image_url (single) and image_urls (array) from frontend
        const imageUrl = input.image_url || input.image_urls?.[0];
        if (imageUrl) {
          inputObj.img_url = imageUrl;
        }
        paramsObj.resolution = this.normalizeResolution(resolution);
      } else {
        // T2V uses size parameter (e.g., 1280*720)
        paramsObj.size = this.getWan26T2VSize(resolution, aspectRatio);
      }

      // Duration (Wan 2.6 supports 5, 10, or 15 seconds)
      if (input.duration) {
        paramsObj.duration = input.duration;
      }

      // Note: Wan 2.5+ automatically generates audio for videos
      // No explicit audio parameter needed - use audio_url only for custom audio

      // Prompt expansion (default to true for better results)
      paramsObj.prompt_extend = input.prompt_extend ?? true;

      // Shot type (single or multi)
      if (input.shot_type) {
        paramsObj.shot_type = input.shot_type;
      }
    } else if (isWan22) {
      // Wan 2.2 T2V parameters (wan2.2-t2v-plus)
      // Duration is fixed at 5 seconds, no need to pass
      // Uses size parameter (different format from Wan 2.6)
      paramsObj.size = this.getWan22T2VSize(resolution, aspectRatio);

      // Prompt expansion (default to true)
      paramsObj.prompt_extend = input.prompt_extend ?? true;

      // Note: Wan 2.2 generates silent videos, no audio support
    } else {
      // Fallback for other models
      const imageUrl = input.image_url || input.image_urls?.[0];
      if (imageUrl) {
        inputObj.img_url = imageUrl;
      }
    }

    console.log(
      'Ali Bailian video generation request:',
      JSON.stringify(requestBody, null, 2)
    );

    const response = (await this.makeRequest(
      endpoint,
      'POST',
      requestBody
    )) as Record<string, unknown>;

    const output = response.output as Record<string, unknown>;

    return {
      request_id: output.task_id as string,
      status: 'submitted',
      model: model,
      raw_response: response,
    };
  }

  // Normalize resolution string to Ali format (480P, 720P, 1080P)
  private normalizeResolution(resolution: string): string {
    const res = resolution.toLowerCase();
    if (res.includes('1080')) return '1080P';
    if (res.includes('480')) return '480P';
    return '720P'; // Default to 720P
  }

  async status(
    model: string,
    requestId: string
  ): Promise<VideoGenerationStatus> {
    const endpoint = `/api/v1/tasks/${requestId}`;

    const response = (await this.makeRequest(endpoint, 'GET')) as Record<
      string,
      unknown
    >;

    const output = response.output as Record<string, unknown>;

    // Map Ali status to standard status
    let standardStatus = 'unknown';
    switch (output.task_status) {
      case 'PENDING':
        standardStatus = 'IN_QUEUE';
        break;
      case 'RUNNING':
        standardStatus = 'IN_PROGRESS';
        break;
      case 'SUCCEEDED':
        standardStatus = 'COMPLETED';
        break;
      case 'FAILED':
        standardStatus = 'FAILED';
        break;
      case 'CANCELED':
        standardStatus = 'CANCELLED';
        break;
      case 'UNKNOWN':
        standardStatus = 'UNKNOWN';
        break;
      default:
        standardStatus = output.task_status as string;
    }

    // Handle error message
    let errorMessage: string | null = null;
    if (output.code && output.message) {
      errorMessage = this.getErrorMessage(
        output.code as string,
        output.message as string
      );
    }

    return {
      request_id: requestId,
      status: standardStatus,
      error_message: errorMessage || undefined,
      raw_data: response,
    };
  }

  async result(
    model: string,
    requestId: string
  ): Promise<VideoGenerationResult> {
    const statusResponse = await this.status(model, requestId);

    if (statusResponse.status !== 'COMPLETED') {
      throw new Error(
        `Task not completed. Current status: ${statusResponse.status}`
      );
    }

    const rawResponse = statusResponse.raw_data as Record<string, unknown>;
    const output = rawResponse?.output as Record<string, unknown>;
    const videoUrl = output?.video_url as string;

    if (!videoUrl) {
      throw new Error('Video URL not found in completed task response');
    }

    return {
      request_id: requestId,
      status: 'COMPLETED',
      video_url: videoUrl,
      data: {
        video_url: videoUrl,
        usage: rawResponse?.usage || {},
        orig_prompt: output?.orig_prompt,
        actual_prompt: output?.actual_prompt,
        submit_time: output?.submit_time,
        scheduled_time: output?.scheduled_time,
        end_time: output?.end_time,
      },
    };
  }

  private getErrorMessage(code: string, message: string): string {
    switch (code) {
      case 'InvalidParameter':
        return 'Invalid request parameters, please check your input';
      case 'IPInfringementSuspect':
        return 'Input content may involve intellectual property infringement risk, please modify and try again';
      case 'DataInspectionFailed':
        return 'Input content may contain sensitive information, please modify and try again';
      case 'InternalError':
        return 'Service temporarily unavailable, please try again later';
      default:
        return message || 'Video generation failed, please try again';
    }
  }

  private getAliModelId(model: string): string {
    const modelConfig = getVideoModel(model);
    if (modelConfig?.aliModel) {
      return modelConfig.aliModel;
    }
    return model;
  }
}
