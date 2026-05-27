import { getStorageProvider } from '@/storage';
import { refundVideoCreditsForAsset } from '@/video/credits';
import {
  getVideoGenerationByProviderRequestId,
  updateVideoGenerationById,
} from '@/video/data/video-generation';
import { type NextRequest, NextResponse } from 'next/server';

// Webhook health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'video-generation-webhook',
  });
}

interface KieVeo3WebhookData {
  code: number;
  msg?: string;
  data?: {
    taskId?: string;
    info?: {
      resultUrls?: string[];
    };
    response?: {
      resultUrls?: string[];
    };
    errorCode?: string;
    errorMessage?: string;
  };
}

interface KieSoraWebhookData {
  code: number;
  msg?: string;
  data?: {
    taskId?: string;
    state?: string;
    resultJson?: string;
    failCode?: string;
    failMsg?: string;
    errorCode?: string;
    errorMessage?: string;
  };
}

interface KieGeminiOmniWebhookData {
  code: number;
  msg?: string;
  data?: {
    taskId?: string;
    state?: string;
    status?: string;
    resultJson?: string;
    resultUrls?: string[];
    response?: {
      resultUrls?: string[];
    };
    info?: {
      resultUrls?: string[];
    };
    result?: {
      videoUrl?: string;
      video_url?: string;
      urls?: string[];
      videos?: Array<{ url?: string | string[] }>;
    };
    failCode?: string;
    failMsg?: string;
    errorCode?: string;
    errorMessage?: string;
  };
}

function extractKieGeminiOmniVideoUrl(data: KieGeminiOmniWebhookData['data']) {
  const fromArray = (urls?: string[]) =>
    Array.isArray(urls) && urls.length > 0 ? urls[0] : null;
  const direct =
    fromArray(data?.resultUrls) ||
    fromArray(data?.response?.resultUrls) ||
    fromArray(data?.info?.resultUrls) ||
    data?.result?.videoUrl ||
    data?.result?.video_url ||
    fromArray(data?.result?.urls);
  if (direct) return direct;

  const videoUrl = data?.result?.videos?.[0]?.url;
  if (videoUrl) return Array.isArray(videoUrl) ? videoUrl[0] : videoUrl;

  if (data?.resultJson) {
    try {
      const parsed = JSON.parse(data.resultJson) as {
        resultUrls?: string[];
        videoUrl?: string;
        video_url?: string;
        videos?: Array<{ url?: string | string[] }>;
      };
      const parsedVideoUrl = parsed.videos?.[0]?.url;
      return (
        fromArray(parsed.resultUrls) ||
        parsed.videoUrl ||
        parsed.video_url ||
        (Array.isArray(parsedVideoUrl) ? parsedVideoUrl[0] : parsedVideoUrl) ||
        null
      );
    } catch (error) {
      console.error('Failed to parse Gemini Omni resultJson:', error);
    }
  }

  return null;
}

// BytePlus/Volcano callback format
interface BytePlusCallbackData {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  content?: {
    video_url?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

// Fal.ai callback format
interface FalCallbackData {
  request_id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  payload?: {
    video?: {
      url?: string;
    };
    video_url?: string;
  };
  error?: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[Video Webhook] ========== Incoming Request ==========');
  console.log('[Video Webhook] Time:', new Date().toISOString());

  try {
    const body = await request.json();
    console.log('[Video Webhook] Body:', JSON.stringify(body, null, 2));

    // Determine webhook type and extract data
    let taskId: string | null = null;
    let isSuccess = false;
    let isFailed = false;
    let videoUrl: string | null = null;
    let errorMessage: string | null = null;
    let providerType:
      | 'kie-veo3'
      | 'kie-sora'
      | 'kie-gemini-omni'
      | 'byteplus'
      | 'fal'
      | 'ali' = 'kie-veo3';

    // Try to identify the webhook format

    // BytePlus/Volcano format (has id and status at top level)
    if (body.id && body.status && !body.data) {
      const byteplusData = body as BytePlusCallbackData;
      taskId = byteplusData.id;
      providerType = 'byteplus';

      if (
        byteplusData.status === 'succeeded' &&
        byteplusData.content?.video_url
      ) {
        isSuccess = true;
        videoUrl = byteplusData.content.video_url;
      } else if (byteplusData.status === 'failed') {
        isFailed = true;
        errorMessage = byteplusData.error?.message || 'Video generation failed';
      }
    }
    // Fal.ai format (has request_id)
    else if (body.request_id) {
      const falData = body as FalCallbackData;
      taskId = falData.request_id;
      providerType = 'fal';

      if (falData.status === 'COMPLETED') {
        const url = falData.payload?.video_url || falData.payload?.video?.url;
        if (url) {
          isSuccess = true;
          videoUrl = url;
        }
      } else if (falData.status === 'FAILED') {
        isFailed = true;
        errorMessage = falData.error || 'Video generation failed';
      }
    }
    // KIE format (has data.taskId)
    else if (body.data?.taskId) {
      taskId = body.data.taskId;

      const geminiOmniData = body as KieGeminiOmniWebhookData;
      const geminiOmniVideoUrl = extractKieGeminiOmniVideoUrl(
        geminiOmniData.data
      );
      const geminiOmniState = String(
        geminiOmniData.data?.state || geminiOmniData.data?.status || ''
      ).toLowerCase();

      // Check if it's Veo3 format (has info.resultUrls or response.resultUrls)
      if (
        (body.data.info?.resultUrls || body.data.response?.resultUrls) &&
        !geminiOmniVideoUrl
      ) {
        providerType = 'kie-veo3';
        const veo3Data = body as KieVeo3WebhookData;

        if (veo3Data.code === 200) {
          const resultUrls =
            veo3Data.data?.info?.resultUrls ||
            veo3Data.data?.response?.resultUrls;
          if (resultUrls && resultUrls.length > 0) {
            isSuccess = true;
            videoUrl = resultUrls[0];
          }
        } else {
          isFailed = true;
          errorMessage =
            veo3Data.data?.errorMessage ||
            veo3Data.msg ||
            `Error code: ${veo3Data.code}`;
        }
      }
      // Check if it's Sora format (has resultJson)
      else if (
        body.data.resultJson !== undefined ||
        body.data.state !== undefined
      ) {
        providerType = 'kie-sora';
        const soraData = body as KieSoraWebhookData;

        if (soraData.code === 200 && soraData.data?.state === 'success') {
          if (soraData.data.resultJson) {
            try {
              const resultJson = JSON.parse(soraData.data.resultJson);
              if (resultJson.resultUrls && resultJson.resultUrls.length > 0) {
                isSuccess = true;
                videoUrl = resultJson.resultUrls[0];
              }
            } catch (parseError) {
              console.error('Failed to parse Sora resultJson:', parseError);
              isFailed = true;
              errorMessage = 'Failed to parse result data';
            }
          }
        } else if (
          soraData.code !== 200 ||
          soraData.data?.state === 'failed' ||
          soraData.data?.state === 'error'
        ) {
          isFailed = true;
          errorMessage =
            soraData.data?.failMsg ||
            soraData.data?.errorMessage ||
            soraData.msg ||
            `Error code: ${soraData.code}`;
        }
      }

      if (!isSuccess && !isFailed) {
        providerType = 'kie-gemini-omni';
        if (geminiOmniData.code === 200 && geminiOmniVideoUrl) {
          isSuccess = true;
          videoUrl = geminiOmniVideoUrl;
        } else if (
          geminiOmniData.code !== 200 ||
          ['failed', 'fail', 'error'].includes(geminiOmniState) ||
          geminiOmniData.data?.failCode ||
          geminiOmniData.data?.errorCode
        ) {
          isFailed = true;
          errorMessage =
            geminiOmniData.data?.failMsg ||
            geminiOmniData.data?.errorMessage ||
            geminiOmniData.msg ||
            `Error code: ${geminiOmniData.code}`;
        }
      }
    }

    if (!taskId) {
      console.error('[Video Webhook] ❌ No taskId found in webhook data');
      return NextResponse.json(
        { error: 'Invalid webhook data' },
        { status: 400 }
      );
    }

    console.log(`[Video Webhook] Provider: ${providerType}, TaskId: ${taskId}`);
    console.log(
      `[Video Webhook] Status: ${isSuccess ? 'SUCCESS' : 'PENDING/FAILED'}`
    );

    // Find the video generation record using unified providerRequestId lookup
    const record = await getVideoGenerationByProviderRequestId(taskId);

    if (!record) {
      console.error(
        `[Video Webhook] ❌ Record not found for taskId: ${taskId}`
      );
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    console.log(
      `[Video Webhook] ✓ Found record: ${record.id}, User: ${record.userId}`
    );

    // Late-success guard: if the record was already force-failed by the
    // cron sweeper (or any other path) AND credits were refunded, refuse
    // to flip the status back to SAVED_TO_R2. The user has been paid
    // back; we'd otherwise hand them a free video on top.
    if (
      isSuccess &&
      record.status === 'FAILED' &&
      (record.metadata as Record<string, unknown> | null)?.refunded === true
    ) {
      console.warn(
        `[Video Webhook] Late success ignored — already refunded: ${record.id}`
      );
      return NextResponse.json({ status: 'ignored_late_success' });
    }

    // Handle success
    if (isSuccess && videoUrl) {
      let videoUrlR2: string | null = null;

      // Try to upload to R2 storage using downloadAndUpload
      console.log('[Video Webhook] Uploading video to R2...');
      try {
        const storage = getStorageProvider();
        const fileName = `generated/videos/${record.id}.mp4`;

        const uploadResult = await storage.downloadAndUpload({
          url: videoUrl,
          key: fileName,
          contentType: 'video/mp4',
        });

        if (uploadResult.url) {
          videoUrlR2 = uploadResult.url;
          console.log(`[Video Webhook] ✓ Uploaded to R2: ${videoUrlR2}`);
        }
      } catch (storageError) {
        console.error('[Video Webhook] ⚠ R2 upload failed:', storageError);
        // Continue without R2 URL
      }

      // Update record as completed
      const finalStatus = videoUrlR2 ? 'SAVED_TO_R2' : 'COMPLETED';
      await updateVideoGenerationById(record.id, {
        status: finalStatus,
        videoUrl,
        videoUrlR2: videoUrlR2 || undefined,
      });

      console.log(
        `[Video Webhook] ✅ Completed: ${record.id}, Status: ${finalStatus}`
      );
    }
    // Handle explicit failure
    else if (isFailed) {
      console.log(`[Video Webhook] ❌ Generation failed: ${errorMessage}`);

      // Mark FAILED first so even if the refund step crashes the record
      // doesn't sit in PROCESSING forever; the refund helper is idempotent
      // and stamps `metadata.refunded` / zeroes `creditsUsed` on success.
      await updateVideoGenerationById(record.id, {
        status: 'FAILED',
        errorMessage: errorMessage || 'Video generation failed',
      });

      try {
        await refundVideoCreditsForAsset(record);
      } catch (refundError) {
        console.error('[Video Webhook] ⚠ Refund failed:', refundError);
      }
    }
    // Progress update (not success, not failed) - just acknowledge
    else {
      console.log(
        `[Video Webhook] ℹ Progress update for: ${record.id}, ignoring...`
      );
    }

    const duration = Date.now() - startTime;
    console.log(`[Video Webhook] ========== Done (${duration}ms) ==========\n`);

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[Video Webhook] ❌ Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
