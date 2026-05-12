import { assetExistsForUser, toggleAssetFavorite } from '@/assets/data/asset';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = (await request.json()) as { assetId?: string };

    if (!body.assetId) {
      return NextResponse.json(
        { success: false, error: 'Missing assetId' },
        { status: 400 }
      );
    }

    const exists = await assetExistsForUser({
      assetId: body.assetId,
      userId,
    });

    if (!exists) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    const result = await toggleAssetFavorite(userId, body.assetId);

    return NextResponse.json({
      success: true,
      favorited: result.favorited,
    });
  } catch (error) {
    console.error('Toggle asset favorite error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
