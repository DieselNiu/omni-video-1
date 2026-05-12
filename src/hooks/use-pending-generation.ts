'use client';

import { useImageGeneration } from '@/hooks/use-image-generation';
import { useMultiGeneration } from '@/hooks/use-multi-generation';
import { useToast } from '@/hooks/use-toast';
import { useVideoGeneration } from '@/hooks/use-video-generation';
import { useAppPageStore } from '@/stores/app-page-store';
import { useCallback, useEffect, useRef } from 'react';

/** Remove the optimistic placeholder card if the submit API failed. */
function removePlaceholder(tempId: string) {
  useAppPageStore.getState().removeActiveGeneration(tempId);
}

/** Extracts the special error code (e.g. NSFW_BLOCKED) attached by the
 * generation hooks when the submit API fails. */
function getErrorCode(error: unknown): string | undefined {
  return (error as Error & { code?: string })?.code;
}

/**
 * Consumes a pending generation from the store (set by /image or /video page)
 * and automatically submits it on mount. This enables instant redirect:
 * user clicks Generate → params stored → redirect to /app → this hook fires the API call.
 *
 * On submit-time moderation errors (NSFW_BLOCKED / CONTENT_MODERATION) the
 * upgrade dialog is opened via the shared `moderationDialog` state in the
 * store; the same state is also written by the polling loop in
 * use-multi-generation when the upstream provider rejects mid-flight, so
 * AppPageClient only needs one subscription to render the dialog.
 */
export function usePendingGeneration() {
  const { toast } = useToast();
  const { generate: generateImage } = useImageGeneration();
  const { generate: generateVideo } = useVideoGeneration();
  const { trackGeneration } = useMultiGeneration();
  const consumedRef = useRef(false);

  const handleSubmitError = useCallback(
    (error: Error) => {
      const code = getErrorCode(error);
      if (code === 'NSFW_BLOCKED') {
        useAppPageStore.getState().setModerationDialog('blocked');
        return;
      }
      if (code === 'CONTENT_MODERATION') {
        useAppPageStore.getState().setModerationDialog('moderation');
        return;
      }
      toast({
        title: 'Generation failed',
        description: error.message,
        variant: 'destructive',
      });
    },
    [toast]
  );

  useEffect(() => {
    if (consumedRef.current) return;

    const pending = useAppPageStore.getState().consumePendingGeneration();
    if (!pending) return;

    consumedRef.current = true;

    if (pending.type === 'image') {
      const { tempId } = pending;
      generateImage(
        {
          modelId: pending.modelId,
          prompt: pending.prompt,
          mode: pending.mode,
          imageUrls: pending.imageUrls,
          aspectRatio: pending.aspectRatio,
          resolution: pending.resolution,
        },
        {
          onSubmitted: (response) => {
            trackGeneration(
              {
                id: response.id,
                taskId: response.taskId,
                status: response.status,
                mediaType: 'image',
                startTime: Date.now(),
                prompt: pending.prompt,
                modelId: pending.modelId,
              },
              tempId
            );
          },
          onError: (error) => {
            removePlaceholder(tempId);
            handleSubmitError(error);
          },
        }
      );
    } else {
      const { tempId } = pending;
      generateVideo(
        {
          model: pending.model,
          prompt: pending.prompt,
          generationType: pending.generationType,
          image_urls: pending.imageUrls,
          image_roles: pending.imageRoles,
          aspect_ratio: pending.aspectRatio,
          duration: pending.duration,
          resolution: pending.resolution,
          generate_audio: pending.generateAudio,
        },
        {
          onSubmitted: (response) => {
            trackGeneration(
              {
                id: response.id,
                taskId: response.requestId,
                status: response.status,
                mediaType: 'video',
                startTime: Date.now(),
                prompt: pending.prompt,
                modelId: pending.model,
              },
              tempId
            );
          },
          onError: (error) => {
            removePlaceholder(tempId);
            handleSubmitError(error);
          },
        }
      );
    }
  }, [generateImage, generateVideo, trackGeneration, handleSubmitError]);
}
