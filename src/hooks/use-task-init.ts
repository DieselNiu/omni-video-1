'use client';

import type { Asset } from '@/assets/types';
import { useMultiGeneration } from '@/hooks/use-multi-generation';
import { useEffect, useRef } from 'react';

const IN_PROGRESS_STATUSES = ['PENDING', 'IN_QUEUE', 'IN_PROGRESS'];

/**
 * On mount, fetches the asset by taskId and starts polling if it's still in progress.
 * If the asset is already completed, the feed will naturally show and highlight it.
 */
export function useTaskInit(taskId?: string) {
  const { trackGeneration } = useMultiGeneration();
  const initializedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!taskId || initializedRef.current === taskId) return;
    initializedRef.current = taskId;

    const fetchAndTrack = async () => {
      try {
        const response = await fetch(`/api/assets/${taskId}`);
        if (!response.ok) return;

        const data = (await response.json()) as {
          success: boolean;
          asset: Asset;
        };
        if (!data.success || !data.asset) return;

        const asset = data.asset;

        // Only start polling if the asset is still in progress
        if (IN_PROGRESS_STATUSES.includes(asset.status)) {
          trackGeneration({
            id: asset.id,
            taskId: asset.providerRequestId ?? asset.id,
            status: asset.status,
            mediaType: asset.type === 'video' ? 'video' : 'image',
            startTime: new Date(asset.createdAt).getTime(),
            prompt: asset.prompt ?? undefined,
            modelId: asset.modelId ?? undefined,
          });
        }
      } catch {
        // Silently fail — the feed will still show the asset if it exists
      }
    };

    fetchAndTrack();
  }, [taskId, trackGeneration]);
}
