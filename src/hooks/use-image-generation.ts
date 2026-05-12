'use client';

import { useInsufficientCreditsDialogStore } from '@/stores/insufficient-credits-dialog-store';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { creditsKeys } from './use-credits';

// Types
export interface ImageGenerationParams {
  modelId: string;
  prompt: string;
  mode?: 'text-to-image' | 'image-to-image';
  imageUrls?: string[];
  aspectRatio?: string;
  resolution?: string; // 1K, 2K, 4K for Pro model
  outputFormat?: 'png' | 'jpg';
}

export interface ImageGenerationRecord {
  id: string;
  userId: string;
  modelId: string;
  prompt: string;
  mode: string;
  inputImageUrls?: string[];
  aspectRatio: string;
  resolution?: string;
  outputFormat: string;
  providerTaskId?: string;
  status:
    | 'PENDING'
    | 'IN_QUEUE'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'SAVED_TO_R2'
    | 'FAILED';
  imageUrls?: string[];
  imageUrlsR2?: string[];
  errorMessage?: string;
  creditsUsed?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitResponse {
  success: boolean;
  id: string;
  taskId: string;
  status: string;
  creditsUsed: number;
  imageUrl?: string; // For synchronous providers like Flow
  error?: string;
}

export interface StatusResponse {
  success: boolean;
  id: string;
  status: string;
  imageUrls?: string[];
  imageUrlsR2?: string[];
  errorMessage?: string;
  error?: string;
}

export interface HistoryResponse {
  success: boolean;
  data: ImageGenerationRecord[];
  total: number;
  page: number;
  limit: number;
}

// Query keys
export const imageGenerationKeys = {
  all: ['image-generation'] as const,
  history: () => [...imageGenerationKeys.all, 'history'] as const,
  historyList: (page: number, limit: number) =>
    [...imageGenerationKeys.history(), { page, limit }] as const,
  status: (id: string) => [...imageGenerationKeys.all, 'status', id] as const,
};

// Polling configuration — progressive intervals to reduce request volume
const BASE_POLL_INTERVAL = 2000; // Used by useImageGenerationStatus query
const MAX_POLL_DURATION = 20 * 60 * 1000; // 20 minutes max
const MAX_RETRY_COUNT = 5;

/** Returns the polling interval based on how long we've been polling */
function getImagePollingInterval(elapsedMs: number): number {
  if (elapsedMs < 2 * 60 * 1000) return 2000; // 0-2 min: 2s
  if (elapsedMs < 5 * 60 * 1000) return 4000; // 2-5 min: 4s
  return 10000; // 5+ min: 10s
}

/**
 * Hook for image generation operations
 */
export function useImageGeneration() {
  const queryClient = useQueryClient();
  const { openDialog } = useInsufficientCreditsDialogStore();
  const pollingRef = useRef<{
    timeoutId: NodeJS.Timeout | null;
    startTime: number; // When polling started (for progressive interval & timeout)
    retryCount: number;
    isCompleted: boolean; // Prevent duplicate onComplete calls
    sessionId: number; // Incremented each startPolling to invalidate stale polls
    abortController: AbortController | null; // Cancel in-flight fetch on new polling
  }>({
    timeoutId: null,
    startTime: 0,
    retryCount: 0,
    isCompleted: false,
    sessionId: 0,
    abortController: null,
  });

  // Submit generation mutation
  const submitMutation = useMutation({
    mutationFn: async (
      params: ImageGenerationParams
    ): Promise<SubmitResponse> => {
      const response = await fetch('/api/image-generation/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      // Handle insufficient credits (402 Payment Required)
      if (response.status === 402) {
        openDialog({
          currentCredits: data.creditsAvailable ?? 0,
          requiredCredits: data.creditsNeeded ?? 0,
        });
        throw new Error(data.error || 'Insufficient credits');
      }

      // Handle NSFW blocked (403 Forbidden)
      if (response.status === 403 && data.error === 'NSFW_BLOCKED') {
        const error = new Error(
          data.message || 'Content not supported'
        ) as Error & { code?: string };
        error.code = 'NSFW_BLOCKED';
        throw error;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit image generation');
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate history to refresh the list
      queryClient.invalidateQueries({
        queryKey: imageGenerationKeys.history(),
      });
      // Invalidate credits to refresh balance after generation
      queryClient.invalidateQueries({
        queryKey: creditsKeys.balance(),
      });
    },
  });

  // Check status
  const checkStatus = useCallback(
    async (id: string, signal?: AbortSignal): Promise<StatusResponse> => {
      const response = await fetch('/api/image-generation/status', {
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
    },
    []
  );

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current.timeoutId) {
      clearTimeout(pollingRef.current.timeoutId);
      pollingRef.current.timeoutId = null;
    }
    // Abort any in-flight fetch requests
    pollingRef.current.abortController?.abort();
    pollingRef.current.abortController = null;
    pollingRef.current.startTime = 0;
    pollingRef.current.retryCount = 0;
    pollingRef.current.isCompleted = false;
  }, []);

  // Start smart polling
  const startPolling = useCallback(
    (
      id: string,
      callbacks: {
        onUpdate?: (status: StatusResponse) => void;
        onComplete?: (status: StatusResponse) => void;
        onError?: (error: Error) => void;
      }
    ) => {
      // Stop any existing polling (also aborts in-flight requests)
      stopPolling();

      // Increment session ID so stale poll closures become no-ops
      const currentSessionId = ++pollingRef.current.sessionId;
      pollingRef.current.abortController = new AbortController();
      pollingRef.current.startTime = Date.now();

      const scheduleNext = () => {
        if (pollingRef.current.sessionId !== currentSessionId) return;
        const elapsed = Date.now() - pollingRef.current.startTime;
        pollingRef.current.timeoutId = setTimeout(
          poll,
          getImagePollingInterval(elapsed)
        );
      };

      const poll = async () => {
        // Stale session guard — if a new startPolling was called, bail out
        if (pollingRef.current.sessionId !== currentSessionId) return;

        // Check timeout based on elapsed duration
        const elapsed = Date.now() - pollingRef.current.startTime;
        if (elapsed > MAX_POLL_DURATION) {
          if (pollingRef.current.sessionId !== currentSessionId) return;
          stopPolling();
          callbacks.onError?.(
            new Error('Generation timed out. Please check history for results.')
          );
          return;
        }

        try {
          const status = await checkStatus(
            id,
            pollingRef.current.abortController?.signal
          );

          // Stale session guard after await — another generation may have started
          if (pollingRef.current.sessionId !== currentSessionId) return;

          callbacks.onUpdate?.(status);

          // Check if completed or failed
          if (['COMPLETED', 'SAVED_TO_R2'].includes(status.status)) {
            // Guard against duplicate onComplete calls from concurrent polls
            if (pollingRef.current.isCompleted) {
              return;
            }
            pollingRef.current.isCompleted = true;
            stopPolling();
            callbacks.onComplete?.(status);
            // Invalidate history
            queryClient.invalidateQueries({
              queryKey: imageGenerationKeys.history(),
            });
          } else if (status.status === 'FAILED') {
            // Guard against duplicate onError calls
            if (pollingRef.current.isCompleted) {
              return;
            }
            pollingRef.current.isCompleted = true;
            stopPolling();
            const err = new Error(
              status.errorMessage || 'Generation failed'
            ) as Error & { code?: string };
            if (status.errorMessage === 'CONTENT_MODERATION') {
              err.code = 'CONTENT_MODERATION';
            }
            callbacks.onError?.(err);
          } else {
            // Still in progress — schedule next poll
            scheduleNext();
          }

          // Reset retry count on success
          pollingRef.current.retryCount = 0;
        } catch (error) {
          // Ignore aborted requests (caused by new polling session)
          if (error instanceof DOMException && error.name === 'AbortError')
            return;
          // Also bail out if session changed during the catch
          if (pollingRef.current.sessionId !== currentSessionId) return;

          pollingRef.current.retryCount++;

          if (pollingRef.current.retryCount >= MAX_RETRY_COUNT) {
            stopPolling();
            callbacks.onError?.(
              error instanceof Error ? error : new Error('Polling failed')
            );
          } else {
            // Retry — schedule next poll
            scheduleNext();
          }
        }
      };

      // Start polling immediately
      poll();

      // Return stop function
      return stopPolling;
    },
    [checkStatus, queryClient, stopPolling]
  );

  // Combined submit and poll
  const generate = useCallback(
    async (
      params: ImageGenerationParams,
      callbacks?: {
        onStart?: () => void;
        onSubmitted?: (response: SubmitResponse) => void;
        onUpdate?: (status: StatusResponse) => void;
        onComplete?: (status: StatusResponse) => void;
        onError?: (error: Error) => void;
      }
    ) => {
      try {
        // Notify immediately before API call (for sync providers like Flow)
        callbacks?.onStart?.();

        const response = await submitMutation.mutateAsync(params);

        // For async providers, notify that task was created
        if (response.status !== 'COMPLETED') {
          callbacks?.onSubmitted?.(response);
        }

        // Check if already completed (synchronous providers like Flow)
        if (response.status === 'COMPLETED' && response.imageUrl) {
          // Directly call onComplete without polling
          callbacks?.onComplete?.({
            success: true,
            id: response.id,
            status: 'COMPLETED',
            imageUrlsR2: [response.imageUrl],
          });
          return response;
        }

        // Async providers — only start internal polling if the caller does NOT
        // handle polling externally via onSubmitted + trackGeneration.
        if (!callbacks?.onSubmitted) {
          startPolling(response.id, {
            onUpdate: callbacks?.onUpdate,
            onComplete: callbacks?.onComplete,
            onError: callbacks?.onError,
          });
        }

        return response;
      } catch (error) {
        callbacks?.onError?.(
          error instanceof Error ? error : new Error('Generation failed')
        );
        throw error;
      }
    },
    [submitMutation, startPolling]
  );

  return {
    generate,
    submitMutation,
    checkStatus,
    startPolling,
    stopPolling,
    isSubmitting: submitMutation.isPending,
  };
}

/**
 * Hook for fetching image generation history
 */
export function useImageGenerationHistory(page = 1, limit = 20) {
  return useQuery({
    queryKey: imageGenerationKeys.historyList(page, limit),
    queryFn: async (): Promise<HistoryResponse> => {
      const response = await fetch(
        `/api/image-generation/history?page=${page}&limit=${limit}`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch history');
      }

      return data;
    },
  });
}

/**
 * Hook for checking a specific generation status
 */
export function useImageGenerationStatus(id: string | null, enabled = true) {
  return useQuery({
    queryKey: imageGenerationKeys.status(id || ''),
    queryFn: async (): Promise<StatusResponse> => {
      if (!id) throw new Error('No ID provided');

      const response = await fetch('/api/image-generation/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check status');
      }

      return data;
    },
    enabled: enabled && !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Stop refetching if completed or failed
      if (
        data?.status &&
        ['COMPLETED', 'SAVED_TO_R2', 'FAILED'].includes(data.status)
      ) {
        return false;
      }
      return BASE_POLL_INTERVAL;
    },
  });
}
