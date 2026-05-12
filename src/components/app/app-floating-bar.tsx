'use client';

import { FloatingCollapsedBar } from '@/components/shared/floating-collapsed-bar';
import {
  type FloatingBarAspectRatioOption,
  FloatingGenerateBar,
} from '@/components/shared/floating-generate-bar';
import { useGenerateForm } from '@/hooks/use-generate-form';
import { useAppPageStore } from '@/stores/app-page-store';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface AppFloatingBarProps {
  target: 'image' | 'video';
}

const IMAGE_ASPECT_RATIOS: FloatingBarAspectRatioOption[] = [
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
];

// Full video aspect ratio catalog — filtered per-model via supportedAspectRatios.
const VIDEO_ASPECT_RATIOS: FloatingBarAspectRatioOption[] = [
  { value: 'Auto', label: 'Auto' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '21:9', label: '21:9' },
];

export function AppFloatingBar({ target }: AppFloatingBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    panelExpanded,
    setPanelExpanded,
    repromptText,
    setRepromptText,
    panelMode,
  } = useAppPageStore();

  // ─── Shared form state via the centralized hook ──────────────────────
  // Image state, video state, prompt, AND uploaded inputs all live in the
  // store. The floating bar shares them with the left panel forms —
  // typing or uploading in one surface is visible in the other.
  const {
    prompt,
    setPrompt,
    image,
    setImageModel,
    setImageAspectRatio,
    video,
    setVideoModel,
    setVideoAspectRatio,
    setVideoDuration,
    setVideoResolution,
    setVideoGenerateAudio,
    img2imgInputs,
    setImg2imgInputs,
    img2vidFirstFrameInputs,
    setImg2vidFirstFrameInputs,
    img2vidLastFrameInputs,
    setImg2vidLastFrameInputs,
    getImageModelOptions,
    getImageRequiredCredits,
    getVideoModelOptionsFor,
    getAvailableDurations,
    getAvailableResolutions,
    getAvailableAspectRatios,
    getModelSupportsAudio,
    getHasAudioPremium,
    getVideoSupportsLastFrame,
    getVideoRequiredCredits,
    submitImage,
    submitVideo,
  } = useGenerateForm();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Local media type — the floating bar has its own image/video toggle,
  // independent of panelMode. This lets the user stage a different
  // generation type from the bar without disturbing the left panel until
  // they actually submit (which commits the choice to the URL).
  const [mediaType, setMediaType] = useState<'image' | 'video'>(target);

  // External URL changes (deep-link, after Generate) resync local mediaType.
  useEffect(() => {
    setMediaType(target);
  }, [target]);

  const switchMediaType = useCallback(
    (next: 'image' | 'video') => setMediaType(next),
    []
  );

  // For the collapsed bar (where the left panel owns the upload UI) we
  // still need to know whether the user is in an img2X panelMode, so the
  // collapsed Generate button can refuse to fire without a ready image.
  const isImg2ImgPanel = panelMode === 'img2img';
  const isImg2VidPanel = panelMode === 'img2vid';

  // ─── Per-mediaType reads from the shared store ────────────────────────
  const selectedModel =
    mediaType === 'image' ? image.selectedModel : video.selectedModel;
  const aspectRatio =
    mediaType === 'image' ? image.aspectRatio : video.aspectRatio;

  const modelOptions = useMemo(
    () =>
      mediaType === 'image'
        ? getImageModelOptions('text-to-image')
        : getVideoModelOptionsFor(false),
    [mediaType, getImageModelOptions, getVideoModelOptionsFor]
  );

  const handleModelChange = useCallback(
    (modelId: string) => {
      if (mediaType === 'image') {
        setImageModel(modelId);
      } else {
        setVideoModel(modelId, false);
      }
    },
    [mediaType, setImageModel, setVideoModel]
  );

  const handleAspectRatioChange = useCallback(
    (ar: string) => {
      if (mediaType === 'image') {
        setImageAspectRatio(ar);
      } else {
        setVideoAspectRatio(ar);
      }
    },
    [mediaType, setImageAspectRatio, setVideoAspectRatio]
  );

  // Video-only derived values — only consulted when mediaType === 'video'
  const availableDurations = useMemo(
    () => getAvailableDurations(false),
    [getAvailableDurations]
  );
  const availableResolutions = useMemo(
    () => getAvailableResolutions(false),
    [getAvailableResolutions]
  );
  const availableVideoAspectRatios = useMemo(() => {
    const supported = getAvailableAspectRatios(false);
    return VIDEO_ASPECT_RATIOS.filter((r) => supported.includes(r.value));
  }, [getAvailableAspectRatios]);
  const modelSupportsAudio = getModelSupportsAudio(false);
  const hasAudioPremium = getHasAudioPremium(false);
  const videoSupportsLastFrame = getVideoSupportsLastFrame();

  // Ready-upload checks — used to decide the effective submit mode
  // (txt2X vs img2X) and to gate the collapsed-bar button.
  const hasReadyImg2ImgInput = img2imgInputs.some(
    (img) => img.r2Url && !img.uploading
  );
  const hasReadyImg2VidInput = img2vidFirstFrameInputs.some(
    (img) => img.r2Url && !img.uploading
  );
  const hasReadyImg2VidLastFrame = img2vidLastFrameInputs.some(
    (img) => img.r2Url && !img.uploading
  );

  // Effective submit mode, derived from the local mediaType + whether the
  // user actually has a ready upload for that type. The floating bar is
  // self-contained: uploading promotes the submission to img2X, not
  // uploading leaves it at txt2X. No need to look at panelMode here.
  const willBeImg2Img = mediaType === 'image' && hasReadyImg2ImgInput;
  const willBeImg2Vid = mediaType === 'video' && hasReadyImg2VidInput;

  const requiredCredits =
    mediaType === 'image'
      ? getImageRequiredCredits()
      : getVideoRequiredCredits(willBeImg2Vid);

  // Two different "can generate" rules:
  //   - Expanded bar: upload is optional (users can choose txt2X or img2X
  //     inline). Only prompt is required.
  //   - Collapsed bar: the left panel owns upload UI. If the left panel is
  //     in an img2X mode, the user MUST have uploaded there before the
  //     collapsed bar fires.
  const canGenerateExpanded = !!prompt.trim();
  const canGenerateCollapsed =
    !!prompt.trim() &&
    (!isImg2ImgPanel || hasReadyImg2ImgInput) &&
    (!isImg2VidPanel || hasReadyImg2VidInput);

  const aspectRatioOptions =
    mediaType === 'image' ? IMAGE_ASPECT_RATIOS : availableVideoAspectRatios;

  useEffect(() => {
    if (repromptText) {
      setPrompt(repromptText);
      setRepromptText(null);
      textareaRef.current?.focus();
    }
  }, [repromptText, setRepromptText, setPrompt]);

  const commitMediaTypeToUrl = useCallback(() => {
    // If the user toggled media type in the floating bar, commit that
    // choice to the URL now so the left panel + page state follow.
    // Drop any stale taskId so the new generation isn't shadowed by an
    // old task.
    if (mediaType !== target) {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('target', mediaType);
      params.delete('taskId');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [mediaType, target, router, pathname, searchParams]);

  const handleGenerate = useCallback(async () => {
    commitMediaTypeToUrl();
    if (mediaType === 'image') {
      const imageUrls = willBeImg2Img
        ? img2imgInputs
            .filter((img) => img.r2Url && !img.uploading)
            .map((img) => img.r2Url as string)
        : undefined;
      await submitImage({
        isImageInput: willBeImg2Img,
        imageUrls,
        onSubmittedToGallery: () => setPrompt(''),
      });
    } else {
      // Three cases:
      //   1. No first frame    → TEXT_2_VIDEO (no images)
      //   2. First only        → IMAGE_2_VIDEO with [first_frame]
      //   3. First + last      → FIRST_AND_LAST_FRAMES_2_VIDEO with both
      const firstUrl = img2vidFirstFrameInputs.find(
        (img) => img.r2Url && !img.uploading
      )?.r2Url;
      const lastUrl =
        videoSupportsLastFrame && hasReadyImg2VidLastFrame
          ? img2vidLastFrameInputs.find((img) => img.r2Url && !img.uploading)
              ?.r2Url
          : undefined;

      let imageUrls: string[] | undefined;
      let imageRoles:
        | ('first_frame' | 'last_frame' | 'reference_image')[]
        | undefined;
      let generationType: string;

      if (firstUrl && lastUrl) {
        imageUrls = [firstUrl, lastUrl];
        imageRoles = ['first_frame', 'last_frame'];
        generationType = 'FIRST_AND_LAST_FRAMES_2_VIDEO';
      } else if (firstUrl) {
        imageUrls = [firstUrl];
        imageRoles = ['first_frame'];
        generationType = 'IMAGE_2_VIDEO';
      } else {
        imageUrls = undefined;
        imageRoles = undefined;
        generationType = 'TEXT_2_VIDEO';
      }

      await submitVideo({
        isImageInput: !!firstUrl,
        imageUrls,
        imageRoles,
        generationType,
        onSubmittedToGallery: () => setPrompt(''),
      });
    }
  }, [
    mediaType,
    willBeImg2Img,
    img2imgInputs,
    img2vidFirstFrameInputs,
    img2vidLastFrameInputs,
    videoSupportsLastFrame,
    hasReadyImg2VidLastFrame,
    commitMediaTypeToUrl,
    submitImage,
    submitVideo,
    setPrompt,
  ]);

  const handleExpandFloating = useCallback(() => {
    setPanelExpanded(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, [setPanelExpanded]);

  // ─── Collapsed bar (left panel open) — reuses shared FloatingCollapsedBar ───
  if (panelExpanded) {
    return (
      <div className="absolute bottom-4 left-4 right-4 z-10">
        <FloatingCollapsedBar
          prompt={prompt}
          credits={requiredCredits}
          isGenerating={false}
          canGenerate={canGenerateCollapsed}
          onBarClick={handleExpandFloating}
          onGenerate={handleGenerate}
        />
      </div>
    );
  }

  // ─── Expanded bar (left panel closed) — uses shared FloatingGenerateBar ───
  return (
    <div className="absolute bottom-4 left-4 right-4 z-10">
      <FloatingGenerateBar
        mediaType={mediaType}
        onSwitchMediaType={switchMediaType}
        prompt={prompt}
        onPromptChange={setPrompt}
        textareaRef={textareaRef}
        selectedModel={selectedModel}
        modelOptions={modelOptions}
        onModelChange={handleModelChange}
        aspectRatio={aspectRatio}
        aspectRatioOptions={aspectRatioOptions}
        onAspectRatioChange={handleAspectRatioChange}
        videoDuration={video.duration}
        videoDurationOptions={availableDurations}
        onVideoDurationChange={setVideoDuration}
        videoResolution={video.resolution}
        videoResolutionOptions={availableResolutions}
        onVideoResolutionChange={setVideoResolution}
        showAudioToggle={modelSupportsAudio && hasAudioPremium}
        generateAudio={video.generateAudio}
        onGenerateAudioChange={setVideoGenerateAudio}
        img2imgInputs={img2imgInputs}
        onImg2imgInputsChange={setImg2imgInputs}
        img2vidFirstFrameInputs={img2vidFirstFrameInputs}
        onImg2vidFirstFrameInputsChange={setImg2vidFirstFrameInputs}
        img2vidLastFrameInputs={img2vidLastFrameInputs}
        onImg2vidLastFrameInputsChange={setImg2vidLastFrameInputs}
        showLastFrameSlot={videoSupportsLastFrame}
        requiredCredits={requiredCredits}
        canGenerate={canGenerateExpanded}
        onGenerate={handleGenerate}
      />
    </div>
  );
}
