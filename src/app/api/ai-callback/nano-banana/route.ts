import {
  getImageGenerationByProviderTaskId,
  updateImageGenerationById,
} from '@/image/data/image-generation';
import type {
  NanoBananaCallbackData,
  NanoBananaResultData,
} from '@/image/types';
import { refundImageCreditsForAsset } from '@/image/utils/credits';
import {
  applyImageWatermark,
  shouldApplyImageWatermark,
} from '@/lib/watermark';
import { getStorageProvider } from '@/storage';
import { type NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

// Webhook health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'nano-banana-callback',
  });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[Image Callback] ========== Incoming Request ==========');
  console.log('[Image Callback] Time:', new Date().toISOString());

  try {
    const body = (await request.json()) as NanoBananaCallbackData;
    console.log('[Image Callback] Body:', JSON.stringify(body, null, 2));

    const { code, data } = body;
    const { taskId, state, resultJson, failCode, failMsg } = data;

    console.log(
      `[Image Callback] TaskId: ${taskId}, State: ${state}, Code: ${code}`
    );

    if (!taskId) {
      console.error('[Image Callback] No taskId found in callback data');
      return NextResponse.json(
        { error: 'Invalid callback data' },
        { status: 400 }
      );
    }

    // Find the image generation record
    const record = await getImageGenerationByProviderTaskId(taskId);

    if (!record) {
      console.error(`[Image Callback] Record not found for taskId: ${taskId}`);
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    console.log(
      `[Image Callback] Found record: ${record.id}, User: ${record.userId}`
    );

    // Handle success
    if (code === 200 && state === 'success' && resultJson) {
      try {
        const resultData: NanoBananaResultData = JSON.parse(resultJson);
        const imageUrls = resultData.resultUrls;

        if (!imageUrls || imageUrls.length === 0) {
          throw new Error('No image URLs in result');
        }

        console.log(
          `[Image Callback] Got ${imageUrls.length} images, uploading to R2...`
        );

        // Try to upload images to R2, applying watermark if needed
        const imageUrlsR2: string[] = [];
        const needsWatermark = await shouldApplyImageWatermark(record.userId);
        try {
          const storage = getStorageProvider();
          for (let i = 0; i < imageUrls.length; i++) {
            const imageUrl = imageUrls[i];
            const ext = imageUrl.includes('.png') ? 'png' : 'jpg';
            const fileName = `generated/images/${record.id}_${i}.${ext}`;

            try {
              if (needsWatermark) {
                // Download -> watermark -> upload
                const response = await fetch(imageUrl);
                const originalBuffer = Buffer.from(
                  await response.arrayBuffer()
                );
                const metadata = await sharp(originalBuffer).metadata();
                const w = metadata.width || 1024;
                const h = metadata.height || 1024;
                const watermarkedBuffer = await applyImageWatermark(
                  originalBuffer,
                  w,
                  h
                );

                const uploadResult = await storage.upload(
                  fileName,
                  watermarkedBuffer,
                  `image/${ext === 'png' ? 'png' : 'jpeg'}`
                );
                if (uploadResult.url) {
                  imageUrlsR2.push(uploadResult.url);
                }
              } else {
                // Direct download and upload (no watermark)
                const uploadResult = await storage.downloadAndUpload({
                  url: imageUrl,
                  key: fileName,
                  contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
                });
                if (uploadResult.url) {
                  imageUrlsR2.push(uploadResult.url);
                }
              }
            } catch (uploadError) {
              console.error(
                `[Image Callback] R2 upload failed for image ${i}:`,
                uploadError
              );
            }
          }
        } catch (storageError) {
          console.error('[Image Callback] R2 storage error:', storageError);
        }

        // Update record as completed
        const finalStatus =
          imageUrlsR2.length > 0 ? 'SAVED_TO_R2' : 'COMPLETED';
        await updateImageGenerationById(record.id, {
          status: finalStatus,
          imageUrls,
          imageUrlsR2: imageUrlsR2.length > 0 ? imageUrlsR2 : undefined,
        });

        console.log(
          `[Image Callback] Completed: ${record.id}, Status: ${finalStatus}, R2: ${imageUrlsR2.length}/${imageUrls.length}`
        );
      } catch (parseError) {
        console.error('[Image Callback] Parse error:', parseError);
        await updateImageGenerationById(record.id, {
          status: 'FAILED',
          errorMessage: 'Failed to parse result data',
        });

        // Refund credits
        await refundImageCreditsForAsset(record);
      }
    } else {
      // Handle failure
      const errorMessage = failMsg || body.msg || 'Image generation failed';
      console.log(`[Image Callback] Generation failed: ${errorMessage}`);

      await updateImageGenerationById(record.id, {
        status: 'FAILED',
        errorMessage: `${errorMessage}${failCode ? ` (Code: ${failCode})` : ''}`,
      });

      // Refund credits
      await refundImageCreditsForAsset(record);
      console.log(`[Image Callback] Credits refunded for ${record.id}`);
    }

    const duration = Date.now() - startTime;
    console.log(
      `[Image Callback] ========== Done (${duration}ms) ==========\n`
    );

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[Image Callback] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
