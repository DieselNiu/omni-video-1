import { getUserAssets } from '@/assets/data/asset';
import { pickPublicImageUrls } from '@/image/utils/public-image-urls';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get('limit') || '20', 10);
    const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10);

    const records = await getUserAssets({
      userId: session.user.id,
      type: 'image',
      favorites: false,
      sort: 'latest',
      limit,
      offset,
    });

    return NextResponse.json({
      data: records.map((record) => ({
        id: record.id,
        modelId: record.modelId,
        prompt: record.prompt,
        mode: record.mode,
        aspectRatio: record.aspectRatio,
        resolution: record.resolution,
        status: record.status,
        // Server picks ONE URL (R2 if present, upstream as fallback)
        // and exposes it via `imageUrlsR2` only — no separate `imageUrls`
        // field, so the upstream provider domain is never visible
        // alongside the chosen URL.
        imageUrlsR2: pickPublicImageUrls(
          record.outputImageUrlsR2,
          record.outputImageUrls
        ),
        errorMessage: record.errorMessage,
        creditsUsed: record.creditsUsed,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })),
      pagination: {
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Image generation history error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
