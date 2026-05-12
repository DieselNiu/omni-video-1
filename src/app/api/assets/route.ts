import { buildPagination } from '@/assets/business/asset-pagination';
import { toPublicAsset } from '@/assets/business/asset-public';
import { countUserAssets, getUserAssets } from '@/assets/data/asset';
import type { AssetSort, AssetType } from '@/assets/types';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

const DEFAULT_PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const searchParams = request.nextUrl.searchParams;

    const typeParam = searchParams.get('type') || 'all';
    if (!['all', 'image', 'video'].includes(typeParam)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const sortParam = searchParams.get('sort') || 'latest';
    if (!['latest', 'oldest'].includes(sortParam)) {
      return NextResponse.json({ error: 'Invalid sort' }, { status: 400 });
    }

    const favoritesParam = searchParams.get('favorites') || '0';
    const favorites = favoritesParam === '1' || favoritesParam === 'true';

    const page = Math.max(
      1,
      Number.parseInt(searchParams.get('page') || '1', 10)
    );
    const pageSize = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(
          searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE),
          10
        )
      )
    );

    const offset = (page - 1) * pageSize;

    const [assets, totalCount] = await Promise.all([
      getUserAssets({
        userId,
        type: typeParam as 'all' | AssetType,
        favorites,
        sort: sortParam as AssetSort,
        limit: pageSize,
        offset,
      }),
      countUserAssets({
        userId,
        type: typeParam as 'all' | AssetType,
        favorites,
      }),
    ]);

    const pagination = buildPagination(totalCount, page, pageSize);

    return NextResponse.json({
      success: true,
      assets: assets.map(toPublicAsset),
      pagination,
    });
  } catch (error) {
    console.error('Get assets error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
