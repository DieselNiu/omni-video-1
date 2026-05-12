'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assetsKeys } from './use-assets';

interface ToggleAssetFavoriteParams {
  assetId: string;
}

interface ToggleAssetFavoriteResponse {
  success: boolean;
  favorited: boolean;
}

export function useToggleAssetFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      assetId,
    }: ToggleAssetFavoriteParams): Promise<ToggleAssetFavoriteResponse> => {
      const response = await fetch('/api/assets/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to toggle favorite');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetsKeys.all });
    },
  });
}
