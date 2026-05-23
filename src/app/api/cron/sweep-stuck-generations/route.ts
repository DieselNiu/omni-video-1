import { getDb } from '@/db';
import { asset } from '@/db/schema';
import { resolveImageGenerationStatus } from '@/image/core/resolve-status';
import { updateImageGenerationById } from '@/image/data/image-generation';
import { refundImageCreditsForAsset } from '@/image/utils/credits';
import { forceFailVideoAsset, sweepVideoAsset } from '@/video/core/sweep-video';
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Assets younger than this are left alone — legit slow generations need
// breathing room before we start polling.
const SWEEP_MIN_AGE_MINUTES = 10;

// Anything stuck past this is treated as dead — force FAILED + idempotent
// refund — but ONLY if we successfully reached the provider this cycle
// and it confirmed the task is still in-progress. If the provider was
// unreachable (network, 5xx, auth, rate limit), we never force-fail —
// the user's result may exist and the provider just couldn't tell us.
// Videos take noticeably longer than images, so give them more time.
const IMAGE_FORCE_FAIL_AGE_MINUTES = 120;
const VIDEO_FORCE_FAIL_AGE_MINUTES = 240;

const IN_PROGRESS_STATUSES = ['PENDING', 'PROCESSING'] as const;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  return run(request);
}

// GET is allowed too so the same endpoint can be hit by curl / browser for
// manual debugging without changing the HTTP verb.
export async function GET(request: NextRequest) {
  return run(request);
}

interface SweepStats {
  scanned: number;
  resolved: number;
  forceFailed: number;
  stillProcessing: number;
  /**
   * Provider couldn't be reached on this cycle — record left untouched
   * to avoid force-failing a task whose result may exist on the upstream.
   */
  providerUnreachable: number;
  errors: number;
}

async function run(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const sweepCutoff = new Date(now - SWEEP_MIN_AGE_MINUTES * 60_000);
  const imageForceFailCutoff = new Date(
    now - IMAGE_FORCE_FAIL_AGE_MINUTES * 60_000
  );
  const videoForceFailCutoff = new Date(
    now - VIDEO_FORCE_FAIL_AGE_MINUTES * 60_000
  );

  const db = await getDb();
  const stuck = await db
    .select()
    .from(asset)
    .where(
      and(
        inArray(asset.type, ['image', 'video']),
        inArray(asset.status, [...IN_PROGRESS_STATUSES]),
        lt(asset.updatedAt, sweepCutoff),
        or(isNull(asset.isDelete), eq(asset.isDelete, false))
      )
    )
    .limit(200);

  const image: SweepStats = {
    scanned: 0,
    resolved: 0,
    forceFailed: 0,
    stillProcessing: 0,
    providerUnreachable: 0,
    errors: 0,
  };
  const video: SweepStats = {
    scanned: 0,
    resolved: 0,
    forceFailed: 0,
    stillProcessing: 0,
    providerUnreachable: 0,
    errors: 0,
  };

  for (const row of stuck) {
    if (row.type === 'image') {
      image.scanned++;
      await sweepImage(row, imageForceFailCutoff, image);
    } else if (row.type === 'video') {
      video.scanned++;
      await sweepVideo(row, videoForceFailCutoff, video);
    }
  }

  return NextResponse.json({
    ok: true,
    image,
    video,
    config: {
      sweepMinAgeMinutes: SWEEP_MIN_AGE_MINUTES,
      imageForceFailAgeMinutes: IMAGE_FORCE_FAIL_AGE_MINUTES,
      videoForceFailAgeMinutes: VIDEO_FORCE_FAIL_AGE_MINUTES,
    },
  });
}

async function sweepImage(
  row: typeof asset.$inferSelect,
  forceFailCutoff: Date,
  stats: SweepStats
) {
  try {
    const resolved = await resolveImageGenerationStatus(
      {
        id: row.id,
        userId: row.userId,
        modelId: row.modelId,
        prompt: row.prompt,
        status: row.status,
        providerRequestId: row.providerRequestId,
        outputImageUrls: row.outputImageUrls,
        outputImageUrlsR2: row.outputImageUrlsR2,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        creditsUsed: row.creditsUsed,
        metadata: row.metadata as Record<string, unknown> | null,
        channel: row.channel,
      },
      // r2-only matches the public-API contract — never persist provider
      // URLs into our DB if R2 upload fails.
      { urlPolicy: 'r2-only' }
    );

    if (IN_PROGRESS_STATUSES.includes(resolved.status as never)) {
      if (resolved.providerProbe === 'unreached') {
        // We tried but the provider didn't answer. Don't force-fail — the
        // result may exist upstream and we just couldn't see it. Wait for
        // the next sweep cycle (or for the provider to recover).
        stats.providerUnreachable++;
      } else if (
        resolved.providerProbe === 'reached' &&
        row.updatedAt &&
        row.updatedAt < forceFailCutoff
      ) {
        // Provider explicitly confirmed still-in-progress past the
        // deadline — treat as truly dead.
        await updateImageGenerationById(row.id, {
          status: 'FAILED',
          errorMessage: 'Generation timed out (provider still in-progress)',
        });
        await refundImageCreditsForAsset({
          id: row.id,
          userId: row.userId,
          modelId: row.modelId,
          creditsUsed: row.creditsUsed,
          metadata: row.metadata as Record<string, unknown> | null,
        });
        stats.forceFailed++;
      } else {
        stats.stillProcessing++;
      }
    } else {
      // resolveImageGenerationStatus already handled FAILED→refund and
      // COMPLETED→R2 upload internally.
      stats.resolved++;
    }
  } catch (err) {
    stats.errors++;
    console.error(
      `[cron/sweep-stuck-generations] image ${row.id} failed:`,
      err instanceof Error ? err.message : err
    );
  }
}

async function sweepVideo(
  row: typeof asset.$inferSelect,
  forceFailCutoff: Date,
  stats: SweepStats
) {
  try {
    const sweepable = {
      id: row.id,
      userId: row.userId,
      modelId: row.modelId,
      status: row.status,
      providerRequestId: row.providerRequestId,
      metadata: row.metadata as Record<string, unknown> | null,
      updatedAt: row.updatedAt,
      channel: row.channel,
      creditsUsed: row.creditsUsed,
      durationSeconds: row.durationSeconds,
      hasAudio: row.hasAudio,
      resolution: row.resolution,
    };

    const outcome = await sweepVideoAsset(sweepable);

    if (outcome === 'error') {
      // Provider threw — don't force-fail. Result may exist upstream.
      // Wait for the provider to recover.
      stats.providerUnreachable++;
    } else if (outcome === 'stillProcessing') {
      if (row.updatedAt && row.updatedAt < forceFailCutoff) {
        // Provider explicitly said still-in-progress past the deadline.
        await forceFailVideoAsset(sweepable);
        stats.forceFailed++;
      } else {
        stats.stillProcessing++;
      }
    } else {
      stats.resolved++;
    }
  } catch (err) {
    stats.errors++;
    console.error(
      `[cron/sweep-stuck-generations] video ${row.id} failed:`,
      err instanceof Error ? err.message : err
    );
  }
}
