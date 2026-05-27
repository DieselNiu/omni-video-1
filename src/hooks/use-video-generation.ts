'use client';

import { useInsufficientCreditsDialogStore } from '@/stores/insufficient-credits-dialog-store';
import { useCallback, useRef } from 'react';

// Types
export interface VideoGenerationParams {
  model: string;
  prompt: string;
  image_urls?: string[];
  image_roles?: ('first_frame' | 'last_frame' | 'reference_image')[];
  /** Input video URL for video-edit models (wan2.7-videoedit). */
  video_url?: string;
  aspect_ratio?: string;
  duration?: number;
  resolution?: string;
  generationType: string;
  generate_audio?: boolean;
  /** Seedance 2.0 multimodal reference inputs. Ignored by providers
   * that don't support them. */
  referenceVideos?: string[];
  referenceAudios?: string[];
  /** Sum of input video durations (reference videos for r2v, source video
   * for video-edit). Used server-side to bill Ali's
   * `input_video_duration + output_video_duration` formula. */
  inputVideoDurationSeconds?: number;
}

export interface VideoSubmitResponse {
  id: string;
  requestId: string;
  status: string;
  requiredCredits: number;
  remainingCredits: number;
  error?: string;
  nsfwFallback?: boolean;
  fallbackModelName?: string;
  creditsUsed?: number;
}

export interface VideoStatusResponse {
  id: string;
  status: string;
  progress: number;
  videoUrl?: string;
  hdVideoUrl?: string;
  hdAvailable?: boolean;
  hdProcessing?: boolean;
  errorMessage?: string;
}

// Polling configuration — progressive intervals to reduce request volume
const MAX_POLL_DURATION = 30 * 60 * 1000; // 30 minutes max
const MAX_RETRY_COUNT = 5;

/** Returns the polling interval based on how long we've been polling */
function getVideoPollingInterval(elapsedMs: number): number {
  if (elapsedMs < 2 * 60 * 1000) return 3000; // 0-2 min: 3s
  if (elapsedMs < 10 * 60 * 1000) return 5000; // 2-10 min: 5s
  return 15000; // 10+ min: 15s
}

/**
 * Hook for video generation operations with polling
 */
export function useVideoGeneration() {
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

  // Check status
  const checkStatus = useCallback(
    async (id: string, signal?: AbortSignal): Promise<VideoStatusResponse> => {
      const response = await fetch('/api/video-generation/status', {
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

  // Start polling
  const startPolling = useCallback(
    (
      id: string,
      callbacks: {
        onUpdate?: (status: VideoStatusResponse) => void;
        onComplete?: (status: VideoStatusResponse) => void;
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
          getVideoPollingInterval(elapsed)
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
            new Error(
              'Video generation timed out. Please check history for results.'
            )
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
          } else if (status.status === 'FAILED') {
            // Guard against duplicate onError calls
            if (pollingRef.current.isCompleted) {
              return;
            }
            pollingRef.current.isCompleted = true;
            stopPolling();
            const err = new Error(
              status.errorMessage || 'Video generation failed'
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
    [checkStatus, stopPolling]
  );

  // Submit video generation
  const submit = useCallback(
    async (params: VideoGenerationParams): Promise<VideoSubmitResponse> => {
      const response = await fetch('/api/video-generation/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      // Handle insufficient credits (402 Payment Required)
      if (response.status === 402) {
        openDialog({
          currentCredits: data.current ?? 0,
          requiredCredits: data.required ?? 0,
        });
        const message =
          data.nsfwFallback?.message || data.error || 'Insufficient credits';
        throw new Error(message);
      }

      if (!response.ok) {
        const error = new Error(
          data.error || 'Failed to submit video generation'
        ) as Error & { code?: string };
        if (data.error === 'NSFW_BLOCKED') {
          error.code = 'NSFW_BLOCKED';
        }
        throw error;
      }

      return data;
    },
    [openDialog]
  );

  // Combined submit and poll
  const generate = useCallback(
    async (
      params: VideoGenerationParams,
      callbacks?: {
        onStart?: () => void;
        onSubmitted?: (response: VideoSubmitResponse) => void;
        onUpdate?: (status: VideoStatusResponse) => void;
        onComplete?: (status: VideoStatusResponse) => void;
        onError?: (error: Error) => void;
      }
    ) => {
      try {
        // Notify immediately before API call (for sync providers like Flow)
        callbacks?.onStart?.();

        const response = await submit(params);

        // For async providers, notify that task was created
        if (response.status !== 'COMPLETED') {
          callbacks?.onSubmitted?.(response);
        }

        // Check if already completed (synchronous providers like Flow)
        if (
          response.status === 'COMPLETED' &&
          (response as VideoSubmitResponse & { videoUrl?: string }).videoUrl
        ) {
          // Directly call onComplete without polling
          callbacks?.onComplete?.({
            id: response.id,
            status: 'COMPLETED',
            progress: 100,
            videoUrl: (response as VideoSubmitResponse & { videoUrl?: string })
              .videoUrl,
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
          error instanceof Error ? error : new Error('Video generation failed')
        );
        throw error;
      }
    },
    [submit, startPolling]
  );

  return {
    generate,
    submit,
    checkStatus,
    startPolling,
    stopPolling,
  };
}
