'use client';

import { reportStartGenerateConversion } from '@/analytics/google-ads-conversion';
import { useCreditsCheck } from '@/hooks/use-credits-check';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useImageGeneration } from '@/hooks/use-image-generation';
import { useMultiGeneration } from '@/hooks/use-multi-generation';
import { useToast } from '@/hooks/use-toast';
import { useVideoGeneration } from '@/hooks/use-video-generation';
import {
  calculateImageCredits,
  getImageModelOptionsByMode,
  supportsImageResolutionSelection,
} from '@/image/config/image-models';
import { useAppPageStore } from '@/stores/app-page-store';
import { useGenerateFormStore } from '@/stores/generate-form-store';
import {
  calculateVideoCredits,
  getVideoModelConfig,
  getVideoModelOptions,
  getVideoModelOptionsForImageToVideo,
  resolveBackendModelId,
} from '@/video/config/video-models';
import { useCallback, useMemo } from 'react';

/**
 * Aggregates the generate-form store with everything the various form
 * surfaces need: model option lists, model-config-derived values
 * (durations / resolutions / aspect ratios / audio capability), credit
 * calculations, and a unified `submitImage()` / `submitVideo()` that runs
 * the optimistic gallery flow + API call.
 *
 * Adding a new model parameter (e.g. seed, negative prompt, style preset)
 * means: add it to the store, expose it via this hook, render it in
 * whichever surface(s) need to show it. No more touching three handler
 * implementations to keep them in sync.
 *
 * Surfaces stay responsible for:
 * - Their own image-input state (uploadedImages / firstFrameImages)
 * - Their own busy / loading UI (the panel forms read genStore for an
 *   "isBusy" indicator; the floating bar relies on the optimistic gallery
 *   card and shows nothing). The hook does NOT track a busy state — it
 *   would force one shape on every surface.
 */

interface SubmitImageOptions {
  /** image-to-image mode — toggles upload validation and the API mode flag */
  isImageInput?: boolean;
  imageUrls?: string[];
  /** Called once the gallery card was added and the API call is in flight.
   *  Surfaces can use this to flip their local "busy" state, swap mobile
   *  tabs, etc. */
  onSubmittedToGallery?: () => void;
}

interface SubmitVideoOptions {
  /** image-to-video mode — same role as SubmitImageOptions.isImageInput */
  isImageInput?: boolean;
  imageUrls?: string[];
  imageRoles?: ('first_frame' | 'last_frame' | 'reference_image')[];
  /** Reference videos / audio (Seedance 2.0 face reference mode). */
  videoUrls?: string[];
  audioUrls?: string[];
  /** Seedance 2.0: also return the video's last frame image. */
  returnLastFrame?: boolean;
  /** Sum of reference video duration, used for provider-side validation. */
  inputVideoDurationSeconds?: number;
  /** TEXT_2_VIDEO / IMAGE_2_VIDEO / FIRST_AND_LAST_FRAMES_2_VIDEO etc. */
  generationType: string;
  onSubmittedToGallery?: () => void;
  /** Called with the real generation id once the task is created. */
  onSubmitted?: (id: string) => void;
}

export function useGenerateForm() {
  const { toast } = useToast();
  const user = useCurrentUser();
  const { checkCredits } = useCreditsCheck();
  const { generate: generateImageApi } = useImageGeneration();
  const { generate: generateVideoApi } = useVideoGeneration();
  const { trackGeneration } = useMultiGeneration();

  const addActiveGeneration = useAppPageStore((s) => s.addActiveGeneration);
  const replaceActiveGeneration = useAppPageStore(
    (s) => s.replaceActiveGeneration
  );
  const removeActiveGeneration = useAppPageStore(
    (s) => s.removeActiveGeneration
  );

  // ─── Store reads ──────────────────────────────────────────────────────
  const prompt = useGenerateFormStore((s) => s.prompt);
  const setPrompt = useGenerateFormStore((s) => s.setPrompt);

  const image = useGenerateFormStore((s) => s.image);
  const setImageModel = useGenerateFormStore((s) => s.setImageModel);
  const setImageAspectRatio = useGenerateFormStore(
    (s) => s.setImageAspectRatio
  );
  const setImageResolution = useGenerateFormStore((s) => s.setImageResolution);

  const video = useGenerateFormStore((s) => s.video);
  const setVideoModel = useGenerateFormStore((s) => s.setVideoModel);
  const setVideoAspectRatio = useGenerateFormStore(
    (s) => s.setVideoAspectRatio
  );
  const setVideoDuration = useGenerateFormStore((s) => s.setVideoDuration);
  const setVideoResolution = useGenerateFormStore((s) => s.setVideoResolution);
  const setVideoGenerateAudio = useGenerateFormStore(
    (s) => s.setVideoGenerateAudio
  );

  // Uploaded inputs (shared across panel + floating bar)
  const img2imgInputs = useGenerateFormStore((s) => s.img2imgInputs);
  const setImg2imgInputs = useGenerateFormStore((s) => s.setImg2imgInputs);
  const img2vidFirstFrameInputs = useGenerateFormStore(
    (s) => s.img2vidFirstFrameInputs
  );
  const setImg2vidFirstFrameInputs = useGenerateFormStore(
    (s) => s.setImg2vidFirstFrameInputs
  );
  const img2vidLastFrameInputs = useGenerateFormStore(
    (s) => s.img2vidLastFrameInputs
  );
  const setImg2vidLastFrameInputs = useGenerateFormStore(
    (s) => s.setImg2vidLastFrameInputs
  );

  // ─── Image derived ────────────────────────────────────────────────────
  const getImageModelOptions = useCallback(
    (mode: 'text-to-image' | 'image-to-image') =>
      getImageModelOptionsByMode(mode),
    []
  );

  const imageShowResolution = useMemo(
    () => supportsImageResolutionSelection(image.selectedModel),
    [image.selectedModel]
  );

  const getImageRequiredCredits = useCallback(
    () =>
      calculateImageCredits(
        image.selectedModel,
        imageShowResolution ? image.resolution : undefined
      ),
    [image.selectedModel, image.resolution, imageShowResolution]
  );

  // ─── Video derived ────────────────────────────────────────────────────
  /** `isImageInput` matters because img2vid and txt2vid can map to different
   *  backend configs for the same frontend model id. */
  const getVideoModelConfigFor = useCallback(
    (isImageInput = false, generationType?: string) =>
      getVideoModelConfig(video.selectedModel, isImageInput, generationType),
    [video.selectedModel]
  );

  const getVideoModelOptionsFor = useCallback(
    (isImageInput = false) =>
      isImageInput
        ? getVideoModelOptionsForImageToVideo()
        : getVideoModelOptions(),
    []
  );

  const getAvailableDurations = useCallback(
    (isImageInput = false, generationType?: string) =>
      getVideoModelConfigFor(isImageInput, generationType)
        ?.supportedDurations ?? [5, 10, 15],
    [getVideoModelConfigFor]
  );

  const getAvailableResolutions = useCallback(
    (isImageInput = false, generationType?: string) =>
      getVideoModelConfigFor(isImageInput, generationType)
        ?.supportedResolutions ?? ['720p', '1080p'],
    [getVideoModelConfigFor]
  );

  const getAvailableAspectRatios = useCallback(
    (isImageInput = false, generationType?: string) =>
      getVideoModelConfigFor(isImageInput, generationType)
        ?.supportedAspectRatios ?? ['Auto', '16:9', '9:16'],
    [getVideoModelConfigFor]
  );

  const getModelSupportsAudio = useCallback(
    (isImageInput = false, generationType?: string) =>
      getVideoModelConfigFor(isImageInput, generationType)?.supportsAudio ??
      false,
    [getVideoModelConfigFor]
  );

  const getHasAudioPremium = useCallback(
    (isImageInput = false, generationType?: string) =>
      (getVideoModelConfigFor(isImageInput, generationType)
        ?.audioPremiumCredits ?? 0) > 0,
    [getVideoModelConfigFor]
  );

  /** Whether the current video model supports a separate last frame
   *  (image-to-video flexible mode = first + optional last frame). */
  const getVideoSupportsLastFrame = useCallback(
    () =>
      getVideoModelConfigFor(true)?.imageCapabilities?.flexibleMode === true,
    [getVideoModelConfigFor]
  );

  const getVideoRequiredCredits = useCallback(
    (isImageInput = false, generationType?: string): number => {
      const config = getVideoModelConfigFor(isImageInput, generationType);
      if (!config) return 0;
      try {
        const backendModelId = resolveBackendModelId(
          video.selectedModel,
          isImageInput,
          generationType
        );
        const durationNum = Number(video.duration) || 0;
        const supportsAudio = config.supportsAudio ?? false;
        const hasPremium = (config.audioPremiumCredits ?? 0) > 0;
        const includeAudio =
          supportsAudio && (hasPremium ? video.generateAudio : true);
        return calculateVideoCredits(
          backendModelId,
          durationNum,
          includeAudio,
          video.resolution
        );
      } catch {
        return 0;
      }
    },
    [
      getVideoModelConfigFor,
      video.selectedModel,
      video.duration,
      video.resolution,
      video.generateAudio,
    ]
  );

  // ─── Submit handlers ──────────────────────────────────────────────────

  const submitImage = useCallback(
    async (opts: SubmitImageOptions = {}) => {
      const { isImageInput = false, imageUrls, onSubmittedToGallery } = opts;
      if (!user) {
        toast({
          title: 'Please log in to generate images',
          variant: 'destructive',
        });
        return;
      }
      reportStartGenerateConversion();
      if (!prompt.trim() && !isImageInput) {
        toast({ title: 'Please enter a prompt', variant: 'destructive' });
        return;
      }
      if (isImageInput && (!imageUrls || imageUrls.length === 0)) {
        toast({
          title: 'Please upload at least one image',
          variant: 'destructive',
        });
        return;
      }
      const required = getImageRequiredCredits();
      if (!checkCredits(required)) return;

      // Optimistic gallery card. Released synchronously so the surface can
      // immediately re-enable inputs / queue another generation.
      const tempId = `temp-${Date.now()}`;
      const startTime = Date.now();
      const capturedPrompt = prompt.trim();
      addActiveGeneration({
        id: tempId,
        taskId: tempId,
        status: 'SUBMITTING',
        mediaType: 'image',
        startTime,
        prompt: capturedPrompt,
        modelId: image.selectedModel,
      });
      onSubmittedToGallery?.();

      try {
        await generateImageApi(
          {
            modelId: image.selectedModel,
            prompt: capturedPrompt,
            mode: isImageInput ? 'image-to-image' : 'text-to-image',
            imageUrls: isImageInput ? imageUrls : undefined,
            aspectRatio: image.aspectRatio,
            resolution: imageShowResolution ? image.resolution : undefined,
          },
          {
            onSubmitted: (response) => {
              const real = {
                id: response.id,
                taskId: response.taskId,
                status: response.status,
                mediaType: 'image' as const,
                startTime,
                prompt: capturedPrompt,
                modelId: image.selectedModel,
              };
              replaceActiveGeneration(tempId, real);
              trackGeneration(real);
            },
            onError: (error) => {
              removeActiveGeneration(tempId);
              toast({
                title: 'Generation failed',
                description: error.message,
                variant: 'destructive',
              });
            },
          }
        );
      } catch {
        removeActiveGeneration(tempId);
      }
    },
    [
      user,
      prompt,
      image.selectedModel,
      image.aspectRatio,
      image.resolution,
      imageShowResolution,
      checkCredits,
      getImageRequiredCredits,
      addActiveGeneration,
      replaceActiveGeneration,
      removeActiveGeneration,
      generateImageApi,
      trackGeneration,
      toast,
    ]
  );

  const submitVideo = useCallback(
    async (opts: SubmitVideoOptions) => {
      const {
        isImageInput = false,
        imageUrls,
        imageRoles,
        videoUrls,
        audioUrls,
        returnLastFrame,
        inputVideoDurationSeconds,
        generationType,
        onSubmittedToGallery,
        onSubmitted,
      } = opts;
      if (!user) {
        toast({
          title: 'Please log in to generate videos',
          variant: 'destructive',
        });
        return;
      }
      reportStartGenerateConversion();
      const hasImageInput = !!imageUrls && imageUrls.length > 0;
      const hasMediaInput = !!videoUrls && videoUrls.length > 0;
      if (!prompt.trim() && !isImageInput) {
        toast({ title: 'Please enter a prompt', variant: 'destructive' });
        return;
      }
      if (isImageInput && !hasImageInput && !hasMediaInput) {
        toast({
          title: 'Please upload a source image',
          variant: 'destructive',
        });
        return;
      }
      const required = getVideoRequiredCredits(isImageInput, generationType);
      if (!checkCredits(required)) return;

      const config = getVideoModelConfigFor(isImageInput, generationType);
      const supportsAudio = config?.supportsAudio ?? false;
      const shouldSendAudio = supportsAudio ? video.generateAudio : undefined;

      const tempId = `temp-${Date.now()}`;
      const startTime = Date.now();
      const capturedPrompt = prompt.trim();
      addActiveGeneration({
        id: tempId,
        taskId: tempId,
        status: 'SUBMITTING',
        mediaType: 'video',
        startTime,
        prompt: capturedPrompt,
        modelId: video.selectedModel,
      });
      onSubmittedToGallery?.();

      try {
        await generateVideoApi(
          {
            model: video.selectedModel,
            prompt: capturedPrompt,
            image_urls: imageUrls,
            image_roles: imageRoles,
            video_urls: videoUrls,
            audio_urls: audioUrls,
            return_last_frame: returnLastFrame,
            inputVideoDurationSeconds,
            aspect_ratio: video.aspectRatio,
            duration: Number(video.duration),
            resolution: video.resolution,
            generationType,
            generate_audio: shouldSendAudio,
          },
          {
            onSubmitted: (response) => {
              const real = {
                id: response.id,
                taskId: response.requestId,
                status: response.status,
                mediaType: 'video' as const,
                startTime,
                prompt: capturedPrompt,
                modelId: video.selectedModel,
              };
              replaceActiveGeneration(tempId, real);
              trackGeneration(real);
              onSubmitted?.(response.id);
            },
            onError: (error) => {
              removeActiveGeneration(tempId);
              toast({
                title: 'Video generation failed',
                description: error.message,
                variant: 'destructive',
              });
            },
          }
        );
      } catch {
        removeActiveGeneration(tempId);
      }
    },
    [
      user,
      prompt,
      video.selectedModel,
      video.aspectRatio,
      video.duration,
      video.resolution,
      video.generateAudio,
      checkCredits,
      getVideoRequiredCredits,
      getVideoModelConfigFor,
      addActiveGeneration,
      replaceActiveGeneration,
      removeActiveGeneration,
      generateVideoApi,
      trackGeneration,
      toast,
    ]
  );

  return {
    // shared
    prompt,
    setPrompt,

    // image state + setters
    image,
    setImageModel,
    setImageAspectRatio,
    setImageResolution,

    // video state + setters
    video,
    setVideoModel,
    setVideoAspectRatio,
    setVideoDuration,
    setVideoResolution,
    setVideoGenerateAudio,

    // uploaded inputs
    img2imgInputs,
    setImg2imgInputs,
    img2vidFirstFrameInputs,
    setImg2vidFirstFrameInputs,
    img2vidLastFrameInputs,
    setImg2vidLastFrameInputs,

    // image derived
    getImageModelOptions,
    imageShowResolution,
    getImageRequiredCredits,

    // video derived (each takes isImageInput so the same hook serves
    // both txt2vid and img2vid surfaces correctly)
    getVideoModelConfigFor,
    getVideoModelOptionsFor,
    getAvailableDurations,
    getAvailableResolutions,
    getAvailableAspectRatios,
    getModelSupportsAudio,
    getHasAudioPremium,
    getVideoSupportsLastFrame,
    getVideoRequiredCredits,

    // submit
    submitImage,
    submitVideo,
  };
}
