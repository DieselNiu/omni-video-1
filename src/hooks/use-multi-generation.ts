'use client';

import { appFeedKeys } from '@/hooks/use-app-feed';
import type { ActiveGeneration } from '@/stores/app-page-store';
import { useAppPageStore } from '@/stores/app-page-store';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

// Max time to wait for a newly-completed asset to appear in the feed's
// query cache before giving up and removing the active generation anyway.
const WAIT_FOR_FEED_MAX_MS = 5000;
const WAIT_FOR_FEED_INTERVAL_MS = 50;

/**
 * Polls the React Query cache for any `app-feed` query that contains an
 * asset with the given id. Used to gate the removal of a completed active
 * generation until the feed's data has observably caught up, preventing a
 * brief re-render where dedupedAssets is missing the new asset and the
 * previous generation's card flashes at the top of the list.
 */
async function waitForAssetInFeed(qc: QueryClient, assetId: string) {
  const deadline = Date.now() + WAIT_FOR_FEED_MAX_MS;
  while (Date.now() < deadline) {
    const queries = qc.getQueryCache().findAll({ queryKey: appFeedKeys.all });
    const found = queries.some((q) => {
      const data = q.state.data as
        | { pages?: Array<{ assets?: Array<{ id: string }> }> }
        | undefined;
      return data?.pages?.some((page) =>
        page.assets?.some((a) => a.id === assetId)
      );
    });
    if (found) return;
    await new Promise((resolve) =>
      setTimeout(resolve, WAIT_FOR_FEED_INTERVAL_MS)
    );
  }
}

// Status check endpoints
const STATUS_ENDPOINTS = {
  image: '/api/image-generation/status',
  video: '/api/video-generation/status',
} as const;

// errorMessage values that indicate an upstream content moderation rejection.
// Kept as a small set: the codebase normalises pre-submit blocks to
// 'NSFW_BLOCKED' and provider-side moderation rejections to 'CONTENT_MODERATION'.
const MODERATION_ERROR_CODES = new Set(['NSFW_BLOCKED', 'CONTENT_MODERATION']);

function isModerationError(errorMessage: string): boolean {
  return MODERATION_ERROR_CODES.has(errorMessage);
}

// Progressive polling intervals
function getPollingInterval(
  mediaType: 'image' | 'video',
  elapsedMs: number
): number {
  if (mediaType === 'image') {
    if (elapsedMs < 2 * 60 * 1000) return 2000;
    if (elapsedMs < 5 * 60 * 1000) return 4000;
    return 10000;
  }
  // video
  if (elapsedMs < 2 * 60 * 1000) return 3000;
  if (elapsedMs < 10 * 60 * 1000) return 5000;
  return 15000;
}

const MAX_POLL_DURATION_IMAGE = 20 * 60 * 1000;
const MAX_POLL_DURATION_VIDEO = 30 * 60 * 1000;
const MAX_RETRY_COUNT = 5;

interface PollingSession {
  timeoutId: NodeJS.Timeout | null;
  abortController: AbortController | null;
  retryCount: number;
  stopped: boolean;
}

// ─── Module-level singleton ─────────────────────────────────────────────────
// Shared across all hook instances so polling survives component re-mounts.
const sessions = new Map<string, PollingSession>();

function stopSessionPolling(generationId: string) {
  const session = sessions.get(generationId);
  if (!session) return;
  if (session.timeoutId) clearTimeout(session.timeoutId);
  session.abortController?.abort();
  session.stopped = true;
  sessions.delete(generationId);
}

async function fetchStatus(
  id: string,
  mediaType: 'image' | 'video',
  signal?: AbortSignal
) {
  const response = await fetch(STATUS_ENDPOINTS[mediaType], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    signal,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to check status');
  }
  return data;
}

/**
 * Hook for managing multiple concurrent generation tasks with independent polling.
 *
 * Polling sessions live in a **module-level** map so they are independent of
 * React component lifecycles.  Multiple call-sites can safely invoke
 * `trackGeneration` without duplicating polls — the session map is keyed by
 * generation id so a second `startPolling` for the same id simply replaces
 * the previous one.
 */
export function useMultiGeneration() {
  const queryClient = useQueryClient();
  const { activeGenerations, addActiveGeneration, replaceActiveGeneration } =
    useAppPageStore();

  // Keep a ref to the latest queryClient so the module-level poll closures
  // can invalidate queries without capturing a stale client.
  const qcRef = useRef(queryClient);
  qcRef.current = queryClient;

  const startPolling = useCallback(
    (generation: ActiveGeneration) => {
      // Stop existing session for this id (idempotent)
      stopSessionPolling(generation.id);

      const session: PollingSession = {
        timeoutId: null,
        abortController: new AbortController(),
        retryCount: 0,
        stopped: false,
      };
      sessions.set(generation.id, session);

      const maxDuration =
        generation.mediaType === 'video'
          ? MAX_POLL_DURATION_VIDEO
          : MAX_POLL_DURATION_IMAGE;

      const scheduleNext = () => {
        if (session.stopped) return;
        const elapsed = Date.now() - generation.startTime;
        const interval = getPollingInterval(generation.mediaType, elapsed);
        session.timeoutId = setTimeout(poll, interval);
      };

      const poll = async () => {
        if (session.stopped) return;

        const elapsed = Date.now() - generation.startTime;
        if (elapsed > maxDuration) {
          stopSessionPolling(generation.id);
          useAppPageStore
            .getState()
            .updateActiveGeneration(generation.id, { status: 'FAILED' });
          useAppPageStore.getState().removeActiveGeneration(generation.id);
          return;
        }

        try {
          const status = await fetchStatus(
            generation.id,
            generation.mediaType,
            session.abortController?.signal
          );

          if (session.stopped) return;

          // Update progress in store
          useAppPageStore.getState().updateActiveGeneration(generation.id, {
            status: status.status,
            progress: status.progress,
          });

          if (['COMPLETED', 'SAVED_TO_R2'].includes(status.status)) {
            stopSessionPolling(generation.id);
            // Stash the final media URL on the active generation so the
            // loading card immediately shows the completed image.
            const completedImageUrl =
              status.imageUrlsR2?.[0] ?? status.imageUrls?.[0] ?? undefined;
            const completedVideoUrl = status.videoUrl ?? undefined;
            useAppPageStore.getState().updateActiveGeneration(generation.id, {
              status: status.status,
              outputImageUrl: completedImageUrl,
              outputVideoUrl: completedVideoUrl,
            });
            // Kick off a feed refetch. `invalidateQueries` by itself is not
            // enough — for infinite queries its promise can resolve before
            // the new data is observably in the cache. If we remove the
            // active generation while the feed still renders with stale
            // data, React reconciliation reuses the next card (the prior
            // generation's div) at position 0, causing a visible flash of
            // the previous prompt and image.
            //
            // To eliminate that race, we actively wait until the new asset
            // shows up in the feed's query cache BEFORE removing the
            // loading card. That guarantees dedupedAssets already contains
            // the new asset when the active card disappears.
            qcRef.current.invalidateQueries({ queryKey: appFeedKeys.all });
            await waitForAssetInFeed(qcRef.current, generation.id);
            useAppPageStore.getState().removeActiveGeneration(generation.id);
          } else if (status.status === 'FAILED') {
            stopSessionPolling(generation.id);
            const errorMessage: string | undefined =
              typeof status.errorMessage === 'string'
                ? status.errorMessage
                : undefined;
            useAppPageStore.getState().updateActiveGeneration(generation.id, {
              status: 'FAILED',
              errorMessage,
            });
            // If the upstream failure was a content moderation rejection,
            // surface the upgrade dialog — same flow as a submit-time
            // NSFW_BLOCKED, but originating from the polling phase.
            if (errorMessage && isModerationError(errorMessage)) {
              useAppPageStore
                .getState()
                .setModerationDialog(
                  errorMessage === 'NSFW_BLOCKED' ? 'blocked' : 'moderation'
                );
            }
            // Remove after a short delay so user sees the failure
            setTimeout(() => {
              useAppPageStore.getState().removeActiveGeneration(generation.id);
              qcRef.current.invalidateQueries({
                queryKey: appFeedKeys.all,
              });
            }, 5000);
          } else {
            scheduleNext();
          }

          session.retryCount = 0;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError')
            return;
          if (session.stopped) return;

          session.retryCount++;
          if (session.retryCount >= MAX_RETRY_COUNT) {
            stopSessionPolling(generation.id);
            useAppPageStore
              .getState()
              .updateActiveGeneration(generation.id, { status: 'FAILED' });
            useAppPageStore.getState().removeActiveGeneration(generation.id);
          } else {
            scheduleNext();
          }
        }
      };

      // Start immediately
      poll();
    },
    [] // No React deps — uses zustand.getState() and module-level helpers
  );

  /**
   * Register a new generation task and start polling for it.
   * Safe to call from any component — polling is managed at module level.
   *
   * If `replacePlaceholderId` is provided, an existing optimistic placeholder
   * with that id is atomically swapped for the real generation (no flicker).
   * This is used by the redirect-from-/image flow: a placeholder is added to
   * activeGenerations before navigation so the loading card is visible
   * immediately on /app mount, then replaced once the submit API responds.
   */
  const trackGeneration = useCallback(
    (generation: ActiveGeneration, replacePlaceholderId?: string) => {
      // Skip if already polling this id (prevents duplicates)
      if (sessions.has(generation.id)) return;
      if (replacePlaceholderId) {
        replaceActiveGeneration(replacePlaceholderId, generation);
      } else {
        addActiveGeneration(generation);
      }
      startPolling(generation);
    },
    [addActiveGeneration, replaceActiveGeneration, startPolling]
  );

  /**
   * Stop all active polling sessions.
   */
  const stopAll = useCallback(() => {
    for (const [id] of sessions) {
      stopSessionPolling(id);
    }
  }, []);

  return {
    activeGenerations,
    trackGeneration,
    stopPolling: stopSessionPolling,
    stopAll,
  };
}
