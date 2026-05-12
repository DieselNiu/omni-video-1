'use client';

import type { AssetSort, AssetType, AssetsResponse } from '@/assets/types';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

export const assetsKeys = {
  all: ['assets'] as const,
  list: (params: {
    type: 'all' | AssetType;
    favorites: boolean;
    sort: AssetSort;
    pageSize: number;
  }) => [...assetsKeys.all, 'list', params] as const,
};

interface UseAssetsParams {
  type?: 'all' | AssetType;
  favorites?: boolean;
  sort?: AssetSort;
  pageSize?: number;
  enabled?: boolean;
}

export function useAssets({
  type = 'all',
  favorites = false,
  sort = 'latest',
  pageSize = 20,
  enabled = true,
}: UseAssetsParams = {}) {
  return useInfiniteQuery({
    queryKey: assetsKeys.list({ type, favorites, sort, pageSize }),
    initialPageParam: 1,
    enabled,
    queryFn: async ({ pageParam = 1 }): Promise<AssetsResponse> => {
      const params = new URLSearchParams({
        type,
        favorites: favorites ? '1' : '0',
        sort,
        page: String(pageParam),
        pageSize: String(pageSize),
      });

      const response = await fetch(`/api/assets?${params}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch assets');
      }

      return data;
    },
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore
        ? lastPage.pagination.currentPage + 1
        : undefined,
  });
}

interface DeleteAssetParams {
  id: string;
}

interface DeleteAssetResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
    }: DeleteAssetParams): Promise<DeleteAssetResponse> => {
      const response = await fetch(`/api/assets/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete asset');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetsKeys.all });
    },
  });
}
