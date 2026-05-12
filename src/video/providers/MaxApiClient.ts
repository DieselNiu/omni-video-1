/**
 * Shared MaxAPI HTTP client for video generation providers.
 *
 * Encapsulates the common HTTP communication layer (makeRequest, status, result)
 * used by both MaxAPIVeoProvider and MaxApiProvider, eliminating code duplication
 * while allowing each provider to define its own submit logic.
 */

import type { VideoGenerationResult, VideoGenerationStatus } from '../types';

const MAXAPI_BASE_URL = 'https://api.maxapi.io';
const REQUEST_TIMEOUT = 30_000;

export interface MaxApiTaskResponse {
  code: number;
  msg?: string;
  data?: {
    taskId?: string;
    status?: string;
    result?: {
      type?: string;
      urls?: string[];
    };
    failReason?: string;
    failure_reason?: string;
  };
}

/** Extract the most meaningful error message from a MaxAPI response. */
function extractErrorMessage(
  data: MaxApiTaskResponse['data'],
  fallbackMsg?: string
): string {
  return (
    data?.failure_reason ||
    data?.failReason ||
    fallbackMsg ||
    'Generation failed'
  );
}

export class MaxApiClient {
  private readonly apiKey: string;
  private readonly logPrefix: string;

  constructor(apiKey: string, logPrefix = '[MaxAPI]') {
    if (!apiKey) {
      throw new Error('MAXAPI_API_KEY is required');
    }
    this.apiKey = apiKey;
    this.logPrefix = logPrefix;
  }

  async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown
  ): Promise<unknown> {
    const url = `${MAXAPI_BASE_URL}${endpoint}`;

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `${this.logPrefix} API error: ${response.status} - ${errorText}`
      );
      throw new Error(`MaxAPI error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async checkStatus(requestId: string): Promise<VideoGenerationStatus> {
    const response = (await this.makeRequest(
      `/api/v1/task/${encodeURIComponent(requestId)}`,
      'GET'
    )) as MaxApiTaskResponse;

    if (response.code !== 0) {
      throw new Error(response.msg || 'MaxAPI status check failed');
    }

    const taskStatus = response.data?.status?.toUpperCase();

    let status: string;
    let progress: number;
    let error_message: string | undefined;

    if (taskStatus === 'SUCCESS') {
      status = 'COMPLETED';
      progress = 100;
    } else if (
      taskStatus === 'FAILED' ||
      taskStatus === 'FAIL' ||
      taskStatus === 'FAILURE' ||
      taskStatus === 'TIMEOUT'
    ) {
      status = 'FAILED';
      progress = 100;
      error_message = extractErrorMessage(response.data, response.msg);
    } else {
      status = 'IN_PROGRESS';
      progress = 0;
    }

    return {
      request_id: requestId,
      status,
      progress,
      error_message,
      raw_data: response.data,
    };
  }

  async getResult(requestId: string): Promise<VideoGenerationResult> {
    const response = (await this.makeRequest(
      `/api/v1/task/${encodeURIComponent(requestId)}`,
      'GET'
    )) as MaxApiTaskResponse;

    if (response.code !== 0) {
      throw new Error(response.msg || 'MaxAPI result retrieval failed');
    }

    const taskStatus = response.data?.status?.toUpperCase();

    if (
      taskStatus === 'FAILED' ||
      taskStatus === 'FAIL' ||
      taskStatus === 'FAILURE' ||
      taskStatus === 'TIMEOUT'
    ) {
      return {
        request_id: requestId,
        status: 'FAILED',
        error_message: extractErrorMessage(response.data, response.msg),
        data: response.data,
      };
    }

    if (taskStatus !== 'SUCCESS') {
      return {
        request_id: requestId,
        status: 'IN_PROGRESS',
        data: response.data,
      };
    }

    const videoUrl = response.data?.result?.urls?.[0] || null;

    return {
      request_id: requestId,
      status: 'COMPLETED',
      video_url: videoUrl,
      data: response.data,
    };
  }
}
