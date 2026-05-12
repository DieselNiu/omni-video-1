'use client';

import type { AssetSort, AssetType, AssetsResponse } from '@/assets/types';
import type { FeedFilter } from '@/stores/app-page-store';
import { useInfiniteQuery } from '@tanstack/react-query';

export const appFeedKeys = {
  all: ['app-feed'] as const,
  list: (params: { type: FeedFilter; sort: AssetSort; pageSize: number }) =>
    [...appFeedKeys.all, 'list', params] as const,
};

interface UseAppFeedParams {
  type?: FeedFilter;
  sort?: AssetSort;
  pageSize?: number;
  enabled?: boolean;
}

export function useAppFeed({
  type = 'all',
  sort = 'latest',
  pageSize = 20,
  enabled = true,
}: UseAppFeedParams = {}) {
  return useInfiniteQuery({
    queryKey: appFeedKeys.list({ type, sort, pageSize }),
    initialPageParam: 1,
    enabled,
    queryFn: async ({ pageParam = 1 }): Promise<AssetsResponse> => {
      const params = new URLSearchParams({
        type,
        favorites: '0',
        sort,
        page: String(pageParam),
        pageSize: String(pageSize),
      });

      const response = await fetch(`/api/assets?${params}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch feed');
      }

      return data;
    },
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore
        ? lastPage.pagination.currentPage + 1
        : undefined,
  });
}
