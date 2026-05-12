import { getUserAssets } from '@/assets/data/asset';
import { auth } from '@/lib/auth';
import { parseMetadata } from '@/video/data/video-generation';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      Number.parseInt(searchParams.get('limit') || '20', 10),
      100
    );
    const offset = Number.parseInt(searchParams.get('offset') || '0', 10);

    // Get user's video generations
    const records = await getUserAssets({
      userId,
      type: 'video',
      favorites: false,
      sort: 'latest',
      limit,
      offset,
    });

    // Format response. r2-or-fallback semantics: prefer R2 URL, fall
    // back to the upstream URL if R2 isn't ready yet so the UI keeps
    // rendering. Tighten when an image/video-proxy route lands.
    const videos = records.map((record) => {
      // Prefer the original frontend-facing model id stashed in metadata
      // at submit-time. Falls back to the backend id for legacy rows.
      const meta = parseMetadata(
        record.metadata as Record<string, unknown> | string | null
      );
      const requestedModelId =
        typeof meta?.requestedModelId === 'string'
          ? (meta.requestedModelId as string)
          : null;
      return {
        id: record.id,
        modelId: requestedModelId ?? record.modelId,
        prompt: record.prompt
          ? record.prompt.substring(0, 200) +
            (record.prompt.length > 200 ? '...' : '')
          : '',
        aspectRatio: record.aspectRatio,
        durationSeconds: record.durationSeconds,
        hasAudio: record.hasAudio,
        status: record.status,
        videoUrl: record.outputVideoUrlR2 || record.outputVideoUrl,
        errorMessage: record.errorMessage,
        createdAt: record.createdAt,
      };
    });

    return NextResponse.json({
      videos,
      hasMore: records.length === limit,
    });
  } catch (error) {
    console.error('Video generation history error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
