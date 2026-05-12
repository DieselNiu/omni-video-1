/**
 * Shared HTTP + R2 upload client for MaxAPI image providers.
 * Used by MaxAPINanoBananaProvider and MaxAPIGrokProvider.
 */

import { randomUUID } from 'crypto';
import { S3Provider } from '@/storage/provider/s3';
import type { ImageGenerationResult, ImageGenerationStatus } from '../types';

const MAXAPI_BASE_URL = 'https://api.maxapi.io';
const REQUEST_TIMEOUT = 30_000;

type TaskResponse = {
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
};

export class MaxapiClient {
  private readonly apiKey: string;
  private readonly storage: S3Provider;
  private readonly logTag: string;

  constructor(apiKey: string, logTag: string) {
    if (!apiKey) {
      throw new Error('MAXAPI_API_KEY is required');
    }
    this.apiKey = apiKey;
    this.logTag = logTag;
    this.storage = new S3Provider();
  }

  /**
   * Convert base64 data URL or image URL to public R2 URL.
   * If input is already an HTTP URL, returns it unchanged.
   */
  async convertBase64ToUrl(base64Data: string): Promise<string> {
    if (base64Data.startsWith('http://') || base64Data.startsWith('https://')) {
      return base64Data;
    }

    if (!base64Data.startsWith('data:')) {
      throw new Error('Invalid image data format');
    }

    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid base64 data URL format');
    }

    const [, mimeType, base64Content] = matches;
    const buffer = Buffer.from(base64Content, 'base64');

    let extension = 'jpg';
    if (mimeType === 'image/png') extension = 'png';
    else if (mimeType === 'image/webp') extension = 'webp';
    else if (mimeType === 'image/jpeg') extension = 'jpg';

    const key = `temp/images/${randomUUID()}.${extension}`;
    const result = await this.storage.upload(key, buffer, mimeType);

    console.log(`[${this.logTag}] Converted base64 to R2: ${result.url}`);
    return result.url;
  }

  private async request(
    endpoint: string,
    method: 'GET' | 'POST',
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
        `[${this.logTag}] API error: ${response.status} - ${errorText}`
      );
      throw new Error(`MaxAPI error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async submitTask(body: Record<string, unknown>): Promise<string> {
    console.log(
      `[${this.logTag}] Request body:`,
      JSON.stringify(body, null, 2)
    );

    const response = (await this.request(
      '/api/v1/task/submit',
      'POST',
      body
    )) as TaskResponse;

    console.log(
      `[${this.logTag}] Submit response:`,
      JSON.stringify(response, null, 2)
    );

    if (response.code !== 0) {
      throw new Error(response.msg || 'MaxAPI task submission failed');
    }

    const taskId = response.data?.taskId;
    if (!taskId) {
      throw new Error('No taskId received from MaxAPI');
    }

    return taskId;
  }

  private async queryTask(taskId: string): Promise<TaskResponse> {
    const response = (await this.request(
      `/api/v1/task/${encodeURIComponent(taskId)}`,
      'GET'
    )) as TaskResponse;

    if (response.code !== 0) {
      throw new Error(response.msg || 'MaxAPI task query failed');
    }

    return response;
  }

  async queryStatus(requestId: string): Promise<ImageGenerationStatus> {
    const response = await this.queryTask(requestId);
    const taskStatus = response.data?.status?.toUpperCase();

    let status: string;
    let progress: number;
    let error_message: string | undefined;

    if (taskStatus === 'SUCCESS') {
      status = 'COMPLETED';
      progress = 100;
    } else if (taskStatus === 'FAILED') {
      status = 'FAILED';
      progress = 100;
      error_message =
        response.data?.failure_reason ||
        response.data?.failReason ||
        response.msg ||
        'Generation failed';
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

  async queryResult(requestId: string): Promise<ImageGenerationResult> {
    const response = await this.queryTask(requestId);
    const taskStatus = response.data?.status?.toUpperCase();

    if (taskStatus === 'FAILED') {
      return {
        request_id: requestId,
        status: 'FAILED',
        error_message:
          response.data?.failure_reason ||
          response.data?.failReason ||
          response.msg ||
          'Generation failed',
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

    return {
      request_id: requestId,
      status: 'COMPLETED',
      image_urls: response.data?.result?.urls || [],
      data: response.data,
    };
  }
}
