import { auth } from '@/lib/auth';
import { getStorageProvider } from '@/storage';
import { getVideoProvider } from '@/video';
import { refundVideoCreditsForAsset } from '@/video/credits';
import {
  getVideoGenerationById,
  updateVideoGenerationById,
} from '@/video/data/video-generation';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

// Final statuses that don't need provider sync
const FINAL_STATUSES = ['COMPLETED', 'SAVED_TO_R2', 'FAILED'];

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Parse request body
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // Get video generation record
    const record = await getVideoGenerationById(id);

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    // Check ownership
    if (record.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // If status is final, return current state. r2-or-fallback: prefer
    // R2 URL, fall back to upstream so the UI still renders during R2
    // lag. Tighten when a same-domain video-proxy route lands.
    if (FINAL_STATUSES.includes(record.status)) {
      return NextResponse.json({
        id: record.id,
        status: record.status,
        progress: 100,
        videoUrl: record.outputVideoUrlR2 || record.outputVideoUrl,
        errorMessage: record.errorMessage,
      });
    }

    // Use unified providerRequestId
    const requestId = record.providerRequestId;
    const modelId = record.modelId;

    // If no request ID, return current status
    if (!requestId || !modelId) {
      return NextResponse.json({
        id: record.id,
        status: record.status,
        progress: 0,
        errorMessage: record.errorMessage,
      });
    }

    // Query provider for latest status
    try {
      const { provider } = await getVideoProvider(modelId, record.channel);
      const providerStatus = await provider.status(modelId, requestId);

      // Map provider status to our status
      let newStatus = record.status;
      let progress = providerStatus.progress || 0;

      if (providerStatus.status === 'COMPLETED') {
        // Get the result to check for video URL
        const result = await provider.result(modelId, requestId);

        if (result.video_url) {
          let videoUrlR2: string | null = null;

          // Upload to R2 storage (same logic as webhook)
          console.log('[Video Status] Uploading video to R2...');
          try {
            const storage = getStorageProvider();
            const fileName = `generated/videos/${id}.mp4`;

            const uploadResult = await storage.downloadAndUpload({
              url: result.video_url,
              key: fileName,
              contentType: 'video/mp4',
            });

            if (uploadResult.url) {
              videoUrlR2 = uploadResult.url;
              console.log(`[Video Status] ✓ Uploaded to R2: ${videoUrlR2}`);
            }
          } catch (storageError) {
            console.error('[Video Status] ⚠ R2 upload failed:', storageError);
            // Continue without R2 URL - use provider URL as fallback
          }

          // Persist both URLs in DB for audit. r2-or-fallback: return
          // R2 if available, otherwise upstream so the UI renders
          // immediately rather than appearing stuck during R2 lag.
          const finalStatus = videoUrlR2 ? 'SAVED_TO_R2' : 'COMPLETED';
          const finalVideoUrl = videoUrlR2 || result.video_url;

          await updateVideoGenerationById(id, {
            status: finalStatus,
            videoUrl: result.video_url,
            videoUrlR2: videoUrlR2 || undefined,
          });

          return NextResponse.json({
            id: record.id,
            status: finalStatus,
            progress: 100,
            videoUrl: finalVideoUrl,
          });
        }
      } else if (providerStatus.status === 'FAILED') {
        newStatus = 'FAILED';
        progress = 100;
        const errorMsg =
          providerStatus.error_message || 'Video generation failed';

        // Mark FAILED first so the record never sits in PROCESSING if
        // refund crashes. The refund helper is DB-level idempotent and
        // falls back to record.creditsUsed when metadata.creditDeduction
        // is missing — the webhook + status-poll race is safe.
        await updateVideoGenerationById(id, {
          status: 'FAILED',
          errorMessage: errorMsg,
        });

        try {
          await refundVideoCreditsForAsset(record);
        } catch (refundError) {
          console.error('[Video Status] Refund failed:', refundError);
        }

        return NextResponse.json({
          id: record.id,
          status: newStatus,
          progress,
          errorMessage: errorMsg,
        });
      } else {
        // In progress - update status if changed
        if (
          providerStatus.status === 'IN_PROGRESS' &&
          record.status !== 'IN_PROGRESS'
        ) {
          await updateVideoGenerationById(id, { status: 'IN_PROGRESS' });
          newStatus = 'IN_PROGRESS';
        }
      }

      return NextResponse.json({
        id: record.id,
        status: newStatus,
        progress,
        errorMessage: providerStatus.error_message,
      });
    } catch (providerError) {
      console.error('Provider status check error:', providerError);

      // Return current database status on provider error
      return NextResponse.json({
        id: record.id,
        status: record.status,
        progress: 50,
        errorMessage: record.errorMessage,
      });
    }
  } catch (error) {
    console.error('Video generation status error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
