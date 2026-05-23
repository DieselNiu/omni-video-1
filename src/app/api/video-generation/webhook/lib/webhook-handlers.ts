import { getStorageProvider } from '@/storage';
import { refundVideoCreditsForAsset } from '@/video/credits';
import {
  getVideoGenerationByProviderRequestId,
  updateVideoGenerationById,
} from '@/video/data/video-generation';
import { NextResponse } from 'next/server';

export interface WebhookParseResult {
  taskId: string;
  isSuccess: boolean;
  isFailed: boolean;
  videoUrl: string | null;
  errorMessage: string | null;
  providerType: string;
}

interface MaxApiWebhookBody {
  code: number;
  msg?: string;
  data?: {
    taskId?: string;
    status?: string;
    result?: {
      type?: string;
      urls?: string[];
    };
    errorMessage?: string;
    failure_reason?: string;
  };
}

export function parseMaxApiWebhook(
  body: MaxApiWebhookBody
): WebhookParseResult | null {
  const taskId = body.data?.taskId;
  if (!taskId) {
    return null;
  }

  const status = body.data?.status;
  const urls = body.data?.result?.urls;
  const isSuccess =
    status === 'SUCCESS' && Array.isArray(urls) && urls.length > 0;
  const isFailed =
    status === 'FAILED' ||
    status === 'FAIL' ||
    status === 'FAILURE' ||
    status === 'TIMEOUT';

  // Filter out meaningless msg values like "ok" or "success"
  const meaningfulMsg =
    body.msg && !['ok', 'success'].includes(body.msg.toLowerCase())
      ? body.msg
      : null;

  return {
    taskId,
    isSuccess,
    isFailed,
    videoUrl: isSuccess ? urls![0] : null,
    errorMessage: isFailed
      ? body.data?.failure_reason ||
        body.data?.errorMessage ||
        meaningfulMsg ||
        'Generation failed'
      : null,
    providerType: 'maxapi',
  };
}

export async function handleWebhookResult(
  parsed: WebhookParseResult
): Promise<NextResponse> {
  const startTime = Date.now();

  console.log(
    `[Video Webhook] Provider: ${parsed.providerType}, TaskId: ${parsed.taskId}`
  );
  console.log(
    `[Video Webhook] Status: ${parsed.isSuccess ? 'SUCCESS' : parsed.isFailed ? 'FAILED' : 'PENDING'}`
  );

  const record = await getVideoGenerationByProviderRequestId(parsed.taskId);

  if (!record) {
    console.error(
      `[Video Webhook] Record not found for taskId: ${parsed.taskId}`
    );
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  }

  console.log(
    `[Video Webhook] Found record: ${record.id}, User: ${record.userId}`
  );

  // Late-success guard: if the record was already force-failed by the
  // cron sweeper (or any other path) AND credits were refunded, refuse
  // to flip the status back to SAVED_TO_R2. The user has been paid back;
  // we'd otherwise hand them a free video on top.
  if (
    parsed.isSuccess &&
    record.status === 'FAILED' &&
    (record.metadata as Record<string, unknown> | null)?.refunded === true
  ) {
    console.warn(
      `[Video Webhook] Late success ignored — already refunded: ${record.id}`
    );
    return NextResponse.json({ status: 'ignored_late_success' });
  }

  if (parsed.isSuccess && parsed.videoUrl) {
    let videoUrlR2: string | null = null;

    console.log('[Video Webhook] Uploading video to R2...');
    try {
      const storage = getStorageProvider();
      const fileName = `generated/videos/${record.id}.mp4`;

      const uploadResult = await storage.downloadAndUpload({
        url: parsed.videoUrl,
        key: fileName,
        contentType: 'video/mp4',
      });

      if (uploadResult.url) {
        videoUrlR2 = uploadResult.url;
        console.log(`[Video Webhook] Uploaded to R2: ${videoUrlR2}`);
      }
    } catch (storageError) {
      console.error('[Video Webhook] R2 upload failed:', storageError);
    }

    const finalStatus = videoUrlR2 ? 'SAVED_TO_R2' : 'COMPLETED';
    await updateVideoGenerationById(record.id, {
      status: finalStatus,
      videoUrl: parsed.videoUrl,
      videoUrlR2: videoUrlR2 || undefined,
    });

    console.log(
      `[Video Webhook] Completed: ${record.id}, Status: ${finalStatus}`
    );
  } else if (parsed.isFailed) {
    console.log(`[Video Webhook] Generation failed: ${parsed.errorMessage}`);

    // Mark FAILED first so the record never sits in PROCESSING if refund
    // crashes. `refundVideoCreditsForAsset` is DB-level idempotent and
    // resolves the amount from metadata.creditDeduction with creditsUsed
    // fallback, so missing metadata no longer silently skips the refund.
    await updateVideoGenerationById(record.id, {
      status: 'FAILED',
      errorMessage: parsed.errorMessage || 'Video generation failed',
    });

    try {
      await refundVideoCreditsForAsset(record);
    } catch (refundError) {
      console.error('[Video Webhook] Refund failed:', refundError);
    }
  } else {
    console.log(
      `[Video Webhook] Progress update for: ${record.id}, ignoring...`
    );
  }

  const duration = Date.now() - startTime;
  console.log(`[Video Webhook] Done (${duration}ms)`);

  return NextResponse.json({ status: 'ok' });
}
