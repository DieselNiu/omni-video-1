import type {
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoGenerationResult,
  VideoGenerationStatus,
  VideoProvider,
} from '../types';

type KieGeminiOmniTaskData = {
  taskId?: string;
  state?: string;
  status?: string;
  successFlag?: number | string;
  failCode?: string | null;
  failMsg?: string;
  errorCode?: string;
  errorMessage?: string;
  resultJson?: string;
  resultUrls?: string[];
  response?: { resultUrls?: string[] };
  info?: { resultUrls?: string[] };
  result?: {
    videoUrl?: string;
    video_url?: string;
    videos?: Array<{ url?: string | string[] }>;
    urls?: string[];
  };
};

type KieGeminiOmniResponse = {
  code: number;
  msg?: string;
  data?: KieGeminiOmniTaskData;
};

export class KieGeminiOmniProvider implements VideoProvider {
  private baseUrl = 'https://api.kie.ai/api/v1/jobs';
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Kie.ai API key is required');
    }
    this.apiKey = apiKey;
  }

  getName(): string {
    return 'kie-gemini-omni';
  }

  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown
  ): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body && method === 'POST' ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const text = await response.text();
      let parsed: { msg?: string; error?: { message?: string } } = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { error: { message: text } };
      }
      throw new Error(
        parsed.msg ||
          parsed.error?.message ||
          text ||
          `Kie.ai API error: ${response.status}`
      );
    }

    return response.json();
  }

  private normalizeDuration(duration?: number | string): string {
    const value = String(duration || 8);
    return ['4', '6', '8', '10'].includes(value) ? value : '8';
  }

  private normalizeResolution(resolution?: string): string {
    const value = (resolution || '720p').toLowerCase();
    return value === '1080p' || value === '4k' ? value : '720p';
  }

  private normalizeAspectRatio(value?: string): string {
    return value === '9:16' ? '9:16' : '16:9';
  }

  private extractVideoUrl(data?: KieGeminiOmniTaskData): string | null {
    if (!data) return null;

    const fromArray = (urls?: string[]) =>
      Array.isArray(urls) && urls.length > 0 ? urls[0] : null;

    const direct =
      fromArray(data.resultUrls) ||
      fromArray(data.response?.resultUrls) ||
      fromArray(data.info?.resultUrls) ||
      data.result?.videoUrl ||
      data.result?.video_url ||
      fromArray(data.result?.urls);
    if (direct) return direct;

    const video = data.result?.videos?.[0];
    if (video?.url) {
      return Array.isArray(video.url) ? video.url[0] || null : video.url;
    }

    if (data.resultJson) {
      try {
        const parsed = JSON.parse(data.resultJson) as {
          resultUrls?: string[];
          videoUrl?: string;
          video_url?: string;
          videos?: Array<{ url?: string | string[] }>;
        };
        const parsedVideo = parsed.videos?.[0]?.url;
        return (
          fromArray(parsed.resultUrls) ||
          parsed.videoUrl ||
          parsed.video_url ||
          (Array.isArray(parsedVideo) ? parsedVideo[0] : parsedVideo) ||
          null
        );
      } catch (error) {
        console.error('Failed to parse Gemini Omni resultJson:', error);
      }
    }

    return null;
  }

  private mapStatus(response: KieGeminiOmniResponse): VideoGenerationStatus {
    const data = response.data;
    const state = String(data?.state || data?.status || '').toLowerCase();
    const successFlag =
      typeof data?.successFlag === 'number'
        ? data.successFlag
        : data?.successFlag === '1'
          ? 1
          : undefined;
    const videoUrl = this.extractVideoUrl(data);
    const hasFailure =
      !!data?.errorCode ||
      !!data?.failCode ||
      !!data?.failMsg ||
      ['failed', 'fail', 'error'].includes(state);

    if (hasFailure) {
      return {
        request_id: data?.taskId || '',
        status: 'FAILED',
        progress: 100,
        error_message:
          data?.failMsg ||
          data?.errorMessage ||
          response.msg ||
          data?.errorCode ||
          'Video generation failed',
        raw_data: data,
      };
    }

    if (state === 'success' || state === 'completed' || successFlag === 1) {
      return {
        request_id: data?.taskId || '',
        status: videoUrl ? 'COMPLETED' : 'IN_PROGRESS',
        progress: videoUrl ? 100 : 90,
        raw_data: data,
      };
    }

    return {
      request_id: data?.taskId || '',
      status: 'IN_PROGRESS',
      progress: state === 'processing' || state === 'running' ? 60 : 25,
      raw_data: data,
    };
  }

  async submit(
    model: string,
    input: VideoGenerationRequest,
    webhookUrl?: string
  ): Promise<VideoGenerationResponse> {
    const imageUrls = [
      ...(input.image_urls ?? []),
      ...(input.image_url ? [input.image_url] : []),
    ].filter(
      (url, index, arr): url is string => !!url && arr.indexOf(url) === index
    );

    const referenceVideoUrl =
      input.video_url || (input.referenceVideos ?? []).filter(Boolean)[0];
    const videoDuration =
      typeof input.inputVideoDurationSeconds === 'number'
        ? input.inputVideoDurationSeconds
        : undefined;
    const videoList = referenceVideoUrl
      ? [
          {
            url: referenceVideoUrl,
            start: 0,
            ends: Math.min(10, Math.max(1, Math.ceil(videoDuration || 10))),
          },
        ]
      : undefined;

    const requestBody: Record<string, unknown> = {
      model: 'gemini-omni-video',
      input: {
        prompt: input.prompt,
        duration: this.normalizeDuration(input.duration),
        aspect_ratio: this.normalizeAspectRatio(
          input.aspect_ratio || input.aspectRatio
        ),
        resolution: this.normalizeResolution(input.resolution),
        ...(imageUrls.length > 0 ? { image_urls: imageUrls.slice(0, 7) } : {}),
        ...(videoList ? { video_list: videoList } : {}),
        ...(typeof input.seed === 'number' ? { seed: input.seed } : {}),
      },
      ...(webhookUrl ? { callBackUrl: webhookUrl } : {}),
    };

    console.log(
      'Kie Gemini Omni video generation request:',
      JSON.stringify(requestBody, null, 2)
    );

    const response = (await this.makeRequest(
      '/createTask',
      'POST',
      requestBody
    )) as KieGeminiOmniResponse;

    console.log(
      'Kie Gemini Omni submit response:',
      JSON.stringify(response, null, 2)
    );

    if (response.code !== 200) {
      throw new Error(response.msg || 'Generation request failed');
    }

    if (!response.data?.taskId) {
      throw new Error('No taskId received from Kie Gemini Omni API');
    }

    return {
      request_id: response.data.taskId,
      status: 'submitted',
      model,
      task_id: response.data.taskId,
      raw_response: response,
    };
  }

  async status(
    _model: string,
    requestId: string
  ): Promise<VideoGenerationStatus> {
    const response = (await this.makeRequest(
      `/recordInfo?taskId=${encodeURIComponent(requestId)}`,
      'GET'
    )) as KieGeminiOmniResponse;

    if (response.code !== 200) {
      throw new Error(response.msg || 'Status check failed');
    }

    return {
      ...this.mapStatus(response),
      request_id: requestId,
    };
  }

  async result(
    model: string,
    requestId: string
  ): Promise<VideoGenerationResult> {
    const statusResult = await this.status(model, requestId);
    const rawData = statusResult.raw_data as KieGeminiOmniTaskData | undefined;

    return {
      request_id: requestId,
      status: statusResult.status,
      video_url: this.extractVideoUrl(rawData),
      data: rawData,
      error_message: statusResult.error_message,
      model,
    };
  }
}
