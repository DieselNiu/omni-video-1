import { getImageProvider } from '@/image';
import type { ImageGenerationRequest } from '@/image/types';
import {
  applyImageWatermark,
  shouldApplyImageWatermark,
  stripImageMetadata,
} from '@/lib/watermark';
import { getStorageProvider } from '@/storage';
import sharp from 'sharp';

export type ProviderSubmitFailureKind = 'definitive' | 'unknown';

export interface ProviderSubmitErrorDetails {
  kind: ProviderSubmitFailureKind;
  message: string;
  statusCode: number | null;
}

export interface ProviderSubmitParams {
  /** Product-facing id from the request (e.g. 'gpt-image-2'). */
  modelId: string;
  input: ImageGenerationRequest;
  guardedWebhookToken?: string | null;
  /**
   * Per-request channel override. Wins over env/DB/registry routing. Used by
   * the home flow to send unpaid CN users to maxapi while keeping paid /
   * overseas traffic on the default channel.
   */
  channelOverride?: string | null;
  /**
   * Per-request ExecutableModel override. Set by surface execution rules
   * (e.g. zh-locale → grok-imagine-lite-maxapi) so the chosen executable
   * directly drives provider selection without going through the
   * ProductModel.resolver fallback.
   */
  executableOverride?: string | null;
}

export interface ProviderSubmitResult {
  channel: string;
  requestId: string;
  status: string;
}

export function getMaxApiWebhookGuardToken() {
  const secret = process.env.MAXAPI_WEBHOOK_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

function getBaseUrl() {
  return (
    process.env.WEBHOOK_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'http://localhost:3000'
  );
}

export function buildMaxApiWebhookUrl(guardedWebhookToken?: string | null) {
  const url = new URL('/api/image-generation/webhook/maxapi', getBaseUrl());
  const token = guardedWebhookToken ?? getMaxApiWebhookGuardToken();
  if (token) {
    url.searchParams.set('token', token);
  }
  return url.toString();
}

export async function submitImageGenerationToProvider(
  params: ProviderSubmitParams
): Promise<ProviderSubmitResult> {
  const hasInputImage =
    Array.isArray(params.input.image_urls) &&
    params.input.image_urls.length > 0;
  const { provider, channel, executable } = await getImageProvider(
    params.modelId,
    hasInputImage,
    params.channelOverride,
    params.executableOverride
  );
  const response = await provider.submit(
    executable,
    params.input,
    buildMaxApiWebhookUrl(params.guardedWebhookToken)
  );

  return {
    channel,
    requestId: response.request_id,
    status: response.status,
  };
}

export function classifyProviderSubmitError(
  error: unknown
): ProviderSubmitErrorDetails {
  const message =
    error instanceof Error ? error.message : 'Image generation failed';
  const statusMatch = message.match(/\b(\d{3})\b/);
  const statusCode = statusMatch ? Number(statusMatch[1]) : null;
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('timed out') ||
    lowerMessage.includes('network') ||
    lowerMessage.includes('socket') ||
    lowerMessage.includes('econnreset')
  ) {
    return {
      kind: 'unknown',
      message,
      statusCode,
    };
  }

  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return {
      kind: 'definitive',
      message,
      statusCode,
    };
  }

  return {
    kind: 'unknown',
    message,
    statusCode,
  };
}

export function shouldDeferSubmitFailureRefund(error: unknown) {
  return classifyProviderSubmitError(error).kind === 'unknown';
}

export async function persistGeneratedImageResult(params: {
  recordId: string;
  imageUrl: string;
  userId?: string | null;
}): Promise<{
  imageUrls: string[];
  imageUrlsR2: string[];
  thumbnailUrl: string;
  status: 'SAVED_TO_R2';
}> {
  const storage = getStorageProvider();
  const watermarkRequired = await shouldApplyImageWatermark(params.userId);

  const response = await fetch(params.imageUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download image: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const originalBuffer = Buffer.from(arrayBuffer);
  let finalBuffer: Buffer;

  if (watermarkRequired) {
    const metadata = await sharp(originalBuffer).metadata();
    const width = metadata.width || 1024;
    const height = metadata.height || 1024;
    finalBuffer = Buffer.from(
      await applyImageWatermark(originalBuffer, width, height)
    );
  } else {
    // Even without a watermark, re-encode through sharp to strip any
    // upstream EXIF / XMP tags that might identify the real backend
    // (e.g. `Software: xAI Grok`).
    finalBuffer = await stripImageMetadata(originalBuffer);
  }

  const uploadResult = await storage.upload(
    `generated/images/${params.recordId}.png`,
    finalBuffer,
    'image/png'
  );

  return {
    imageUrls: [params.imageUrl],
    imageUrlsR2: [uploadResult.url],
    thumbnailUrl: uploadResult.url,
    status: 'SAVED_TO_R2',
  };
}
