'use client';

import { PromptOptimizer } from '@/components/dashboard/prompt-optimizer';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useGenerateForm } from '@/hooks/use-generate-form';
import { useVideoGeneration } from '@/hooks/use-video-generation';
import { cn, downloadImage, generateDownloadFilename } from '@/lib/utils';
import { getUploadIntentConfig } from '@/storage/intents';
import { resolveUploadedUrls } from '@/storage/pending-uploads';
import { useAppPageStore } from '@/stores/app-page-store';
import {
  getReferenceVideoModelConfig,
  getVideoModelOptionsForReference,
} from '@/video/config/video-models';
import {
  ArrowLeftRight,
  CoinsIcon,
  Download,
  Eraser,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { UploadedImage } from './image-upload-area';
import { PanelImageUpload } from './panel-image-upload';
import { PanelMediaUpload } from './panel-media-upload';

const REFERENCE_VIDEO_INTENT = getUploadIntentConfig('video-reference-video');
const REFERENCE_AUDIO_INTENT = getUploadIntentConfig('video-reference-audio');
const REFERENCE_VIDEO_MIN_DURATION_SECONDS = 1.8;
const GEMINI_OMNI_REFERENCE_VIDEO_MAX_DURATION_SECONDS = 30;
const DEFAULT_VIDEO_PROMPT_MAX_LENGTH = 4000;
const GEMINI_OMNI_PROMPT_MAX_LENGTH = 20000;

const VIDEO_PROMPT_IDEAS = [
  'Dancing in the Rain',
  'Sunset Time Lapse',
  'Flying Through Clouds',
  'Ocean Waves Crashing',
  'City Street at Night',
  'Blooming Flower Close-up',
  'Northern Lights Sky',
  'Slow Motion Splash',
  'Forest Walk POV',
  'Campfire Under Stars',
  'Snow Falling Gently',
  'Train Window View',
];

const VIDEO_ASPECT_RATIOS = [
  {
    value: 'Auto',
    label: 'Auto',
    iconClass: 'flex size-3 border border-current rounded-[2px]',
  },
  {
    value: '16:9',
    label: '16:9',
    iconClass: 'flex h-2.5 w-4 border border-current rounded-[2px]',
  },
  {
    value: '9:16',
    label: '9:16',
    iconClass: 'flex h-4 w-2.5 border border-current rounded-[2px]',
  },
  {
    value: '1:1',
    label: '1:1',
    iconClass: 'flex size-3 border border-current rounded-[2px]',
  },
  {
    value: '4:3',
    label: '4:3',
    iconClass: 'flex h-3 w-4 border border-current rounded-[2px]',
  },
  {
    value: '3:4',
    label: '3:4',
    iconClass: 'flex h-4 w-3 border border-current rounded-[2px]',
  },
  {
    value: '21:9',
    label: '21:9',
    iconClass: 'flex h-2 w-5 border border-current rounded-[2px]',
  },
];

interface PanelFormVideoProps {
  isImg2Vid: boolean;
}

export function PanelFormVideo({ isImg2Vid }: PanelFormVideoProps) {
  const setMobileTab = useAppPageStore((s) => s.setMobileTab);
  const { startPolling: pollVideoStatus } = useVideoGeneration();

  // ─── Shared form state via the centralized hook ──────────────────────
  const {
    prompt,
    setPrompt,
    video,
    setVideoModel,
    setVideoAspectRatio,
    setVideoDuration,
    setVideoResolution,
    setVideoGenerateAudio,
    img2vidFirstFrameInputs,
    setImg2vidFirstFrameInputs,
    img2vidLastFrameInputs,
    setImg2vidLastFrameInputs,
    getVideoSupportsLastFrame,
    getVideoModelConfigFor,
    getVideoModelOptionsFor,
    getAvailableDurations,
    getAvailableResolutions,
    getAvailableAspectRatios,
    getModelSupportsAudio,
    getVideoRequiredCredits,
    submitVideo,
  } = useGenerateForm();

  const selectedModel = video.selectedModel;
  const videoAspectRatio = video.aspectRatio;
  const duration = video.duration;
  const videoResolution = video.resolution;
  const generateAudio = video.generateAudio;
  const promptMaxLength =
    selectedModel === 'gemini-omni'
      ? GEMINI_OMNI_PROMPT_MAX_LENGTH
      : DEFAULT_VIDEO_PROMPT_MAX_LENGTH;

  // videoInputMode gated below — declared here so the model-options memo
  // can filter against it. Only meaningful when isImg2Vid === true.
  const [videoInputMode, setVideoInputMode] = useState<'frames' | 'reference'>(
    'reference'
  );
  const [addEndFrame, setAddEndFrame] = useState(false);
  const [referenceImages, setReferenceImages] = useState<UploadedImage[]>([]);
  const [referenceVideos, setReferenceVideos] = useState<UploadedImage[]>([]);
  const [referenceAudios, setReferenceAudios] = useState<UploadedImage[]>([]);
  const [returnLastFrame, setReturnLastFrame] = useState(false);
  const [referenceLastFrameUrl, setReferenceLastFrameUrl] = useState<
    string | null
  >(null);
  const supportsLastFrame = getVideoSupportsLastFrame();
  const currentVideoGenerationType = useMemo(() => {
    if (!isImg2Vid) return undefined;
    if (videoInputMode === 'reference') return 'REFERENCE_2_VIDEO';
    if (addEndFrame && supportsLastFrame) {
      return 'FIRST_AND_LAST_FRAMES_2_VIDEO';
    }
    return 'IMAGE_2_VIDEO';
  }, [isImg2Vid, videoInputMode, addEndFrame, supportsLastFrame]);
  const currentVideoConfig = getVideoModelConfigFor(
    isImg2Vid,
    currentVideoGenerationType
  );
  const referenceVideoConfig = getReferenceVideoModelConfig(selectedModel);
  const supportsReferenceMedia = !!referenceVideoConfig?.supportsReferenceMedia;
  const supportsGeminiOmniReferenceVideo =
    isImg2Vid &&
    videoInputMode === 'reference' &&
    selectedModel === 'gemini-omni';
  const supportsReferenceVideos =
    supportsReferenceMedia || supportsGeminiOmniReferenceVideo;
  const maxReferenceVideos = supportsGeminiOmniReferenceVideo ? 1 : 3;
  const maxReferenceImages =
    supportsGeminiOmniReferenceVideo && referenceVideos.length > 0
      ? 5
      : (referenceVideoConfig?.imageCapabilities?.maxImages ??
        currentVideoConfig?.imageCapabilities?.maxImages ??
        3);
  const referenceVideoDurationSeconds = useMemo(
    () =>
      referenceVideos.reduce(
        (sum, video) => sum + (video.durationSeconds ?? 0),
        0
      ),
    [referenceVideos]
  );

  const modelOptions = useMemo(() => {
    if (isImg2Vid && videoInputMode === 'reference') {
      return getVideoModelOptionsForReference();
    }
    return getVideoModelOptionsFor(isImg2Vid);
  }, [getVideoModelOptionsFor, isImg2Vid, videoInputMode]);

  const availableDurations = useMemo(
    () => getAvailableDurations(isImg2Vid, currentVideoGenerationType),
    [getAvailableDurations, isImg2Vid, currentVideoGenerationType]
  );
  const availableResolutions = useMemo(
    () => getAvailableResolutions(isImg2Vid, currentVideoGenerationType),
    [getAvailableResolutions, isImg2Vid, currentVideoGenerationType]
  );
  const availableAspectRatios = useMemo(() => {
    const supported = getAvailableAspectRatios(
      isImg2Vid,
      currentVideoGenerationType
    );
    return VIDEO_ASPECT_RATIOS.filter((r) => supported.includes(r.value));
  }, [getAvailableAspectRatios, isImg2Vid, currentVideoGenerationType]);

  const modelSupportsAudio = getModelSupportsAudio(
    isImg2Vid,
    currentVideoGenerationType
  );
  const totalCredits = getVideoRequiredCredits(
    isImg2Vid,
    currentVideoGenerationType
  );

  // Mode-local UI state — just the idea shuffling now.
  // First-frame uploads live in the shared store so the floating bar
  // can see them too (and gate its img2vid Generate button on them).
  const firstFrameImages = img2vidFirstFrameInputs;
  const setFirstFrameImages = setImg2vidFirstFrameInputs;
  const lastFrameImages = img2vidLastFrameInputs;
  const setLastFrameImages = setImg2vidLastFrameInputs;
  const [ideasSeed, setIdeasSeed] = useState(0);

  // When the selected model stops supporting last frame, force the switch
  // off and clear any staged last frame so the floating bar can't trip
  // on stale state.
  useEffect(() => {
    if (!supportsLastFrame && (addEndFrame || lastFrameImages.length > 0)) {
      setAddEndFrame(false);
      setLastFrameImages([]);
    }
  }, [
    supportsLastFrame,
    addEndFrame,
    lastFrameImages.length,
    setLastFrameImages,
  ]);

  // When sub-mode changes (or on mount) make sure the currently selected
  // model is still valid for the new option list. Reference mode has a
  // narrower filter than frames mode, so a model picked under "Frames to
  // Video" may not support reference generation — snap to the first
  // supported option in that case.
  useEffect(() => {
    if (!isImg2Vid) return;
    if (modelOptions.length === 0) return;
    const stillValid = modelOptions.some((m) => m.value === selectedModel);
    if (!stillValid) {
      setVideoModel(modelOptions[0].value, true, currentVideoGenerationType);
    }
  }, [
    isImg2Vid,
    modelOptions,
    selectedModel,
    setVideoModel,
    currentVideoGenerationType,
  ]);

  useEffect(() => {
    if (!isImg2Vid) return;
    setVideoModel(selectedModel, true, currentVideoGenerationType);
  }, [isImg2Vid, selectedModel, currentVideoGenerationType, setVideoModel]);

  // Toggling "Add End Frame" off should drop staged last frame images so
  // the generation payload stays consistent with what the user sees.
  const handleToggleEndFrame = useCallback(
    (checked: boolean) => {
      setAddEndFrame(checked);
      if (!checked) setLastFrameImages([]);
    },
    [setLastFrameImages]
  );

  const visibleIdeas = useMemo(() => {
    const shuffled = [...VIDEO_PROMPT_IDEAS].sort(
      () => Math.sin(ideasSeed * 9301 + 49297) - 0.5
    );
    return shuffled.slice(0, 4);
  }, [ideasSeed]);

  const handleModelChange = useCallback(
    (modelId: string) =>
      setVideoModel(modelId, isImg2Vid, currentVideoGenerationType),
    [setVideoModel, isImg2Vid, currentVideoGenerationType]
  );

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Optimistic upload: an input image counts the moment it's picked (still
  // uploading) — the upload is awaited at submit time rather than blocking
  // the button. Last frame is optional; reference mode needs ≥1 reference.
  const hasUsableFirstFrame = firstFrameImages.some(
    (img) => !img.error && (img.r2Url || img.uploading)
  );
  const hasUsableReference = referenceImages.some(
    (img) => !img.error && (img.r2Url || img.uploading)
  );
  const hasUsableReferenceVideo =
    supportsReferenceVideos &&
    referenceVideos.some(
      (video) => !video.error && (video.r2Url || video.uploading)
    );
  const canGenerate =
    !isSubmitting &&
    (!supportsGeminiOmniReferenceVideo || !!prompt.trim()) &&
    (!isImg2Vid
      ? !!prompt.trim()
      : videoInputMode === 'reference'
        ? hasUsableReference || hasUsableReferenceVideo
        : hasUsableFirstFrame);

  const handleGenerate = useCallback(async () => {
    setIsSubmitting(true);
    try {
      let imageUrls: string[] | undefined;
      let videoUrls: string[] | undefined;
      let audioUrls: string[] | undefined;
      let imageRoles:
        | ('first_frame' | 'last_frame' | 'reference_image')[]
        | undefined;
      let generationType:
        | 'TEXT_2_VIDEO'
        | 'IMAGE_2_VIDEO'
        | 'FIRST_AND_LAST_FRAMES_2_VIDEO'
        | 'REFERENCE_2_VIDEO';

      if (!isImg2Vid) {
        generationType = 'TEXT_2_VIDEO';
      } else if (videoInputMode === 'reference') {
        // Await any in-flight reference uploads, then read final URLs.
        const refUrls = (await resolveUploadedUrls(referenceImages)).slice(
          0,
          maxReferenceImages
        );
        imageUrls = refUrls.length > 0 ? refUrls : undefined;
        imageRoles =
          refUrls.length > 0
            ? refUrls.map(() => 'reference_image' as const)
            : undefined;
        if (supportsReferenceVideos) {
          const [resolvedVideos, resolvedAudios] = await Promise.all([
            resolveUploadedUrls(referenceVideos),
            resolveUploadedUrls(referenceAudios),
          ]);
          videoUrls =
            resolvedVideos.length > 0
              ? resolvedVideos.slice(0, maxReferenceVideos)
              : undefined;
          audioUrls =
            supportsReferenceMedia && resolvedAudios.length > 0
              ? resolvedAudios.slice(0, 3)
              : undefined;
          if (
            supportsReferenceMedia &&
            videoUrls &&
            referenceVideoDurationSeconds <=
              REFERENCE_VIDEO_MIN_DURATION_SECONDS
          ) {
            toast(
              `Reference videos must total more than ${REFERENCE_VIDEO_MIN_DURATION_SECONDS}s.`
            );
            return;
          }
        }
        generationType = 'REFERENCE_2_VIDEO';
      } else {
        const [firstUrl] = await resolveUploadedUrls(firstFrameImages);
        const lastUrl =
          addEndFrame && supportsLastFrame
            ? (await resolveUploadedUrls(lastFrameImages))[0]
            : undefined;
        if (firstUrl && lastUrl) {
          imageUrls = [firstUrl, lastUrl];
          imageRoles = ['first_frame', 'last_frame'];
          generationType = 'FIRST_AND_LAST_FRAMES_2_VIDEO';
        } else if (firstUrl) {
          imageUrls = [firstUrl];
          imageRoles = ['first_frame'];
          generationType = 'IMAGE_2_VIDEO';
        } else {
          generationType = 'TEXT_2_VIDEO';
        }
      }

      const wantsLastFrame =
        generationType === 'REFERENCE_2_VIDEO' &&
        supportsReferenceMedia &&
        returnLastFrame;
      if (wantsLastFrame) setReferenceLastFrameUrl(null);

      await submitVideo({
        isImageInput: isImg2Vid,
        imageUrls,
        imageRoles,
        videoUrls,
        audioUrls,
        returnLastFrame: wantsLastFrame,
        inputVideoDurationSeconds:
          videoUrls && videoUrls.length > 0
            ? referenceVideoDurationSeconds
            : undefined,
        generationType,
        // Gallery optimistic card shows the in-progress state — the form
        // button stays ready for the next prompt. Clear the prompt so the
        // button flips back to its idle color immediately (otherwise the
        // user can't tell their click landed). Matches floating-bar.
        onSubmittedToGallery: () => {
          setPrompt('');
          setMobileTab('history');
        },
        onSubmitted:
          wantsLastFrame && pollVideoStatus
            ? (id) => {
                pollVideoStatus(id, {
                  onComplete: (status) => {
                    if (status.lastFrameUrl) {
                      setReferenceLastFrameUrl(status.lastFrameUrl);
                    }
                  },
                });
              }
            : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isImg2Vid,
    videoInputMode,
    firstFrameImages,
    lastFrameImages,
    referenceImages,
    referenceVideos,
    referenceAudios,
    referenceVideoDurationSeconds,
    maxReferenceImages,
    maxReferenceVideos,
    supportsReferenceMedia,
    supportsReferenceVideos,
    returnLastFrame,
    addEndFrame,
    supportsLastFrame,
    submitVideo,
    setPrompt,
    setMobileTab,
    pollVideoStatus,
  ]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-6 p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full">
        {/* Model selector */}
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground/70">Model</span>
          <Select value={selectedModel} onValueChange={handleModelChange}>
            <SelectTrigger className="w-full h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  <span className="flex items-center gap-2">
                    {m.logo && <img src={m.logo} alt="" className="size-4" />}
                    <span>{m.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Frame / reference upload for img2vid */}
        {isImg2Vid && (
          <div className="space-y-3">
            {/* Sub-mode pill tabs: Frames vs Reference */}
            <div className="flex items-center gap-2">
              {(
                [
                  { value: 'reference', label: 'Reference to Video' },
                  { value: 'frames', label: 'Frames to Video' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setVideoInputMode(tab.value)}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer',
                    videoInputMode === tab.value
                      ? 'border border-foreground/30 bg-foreground/10 text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {videoInputMode === 'frames' ? (
              addEndFrame && supportsLastFrame ? (
                // Expanded: two side-by-side dropzones with ⇄ connector.
                // The Add End Frame switch lifts above the grid so the
                // user can still toggle it off when the card header is
                // no longer present in either column.
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">
                      Upload Image
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground/70">
                        Add End Frame
                      </span>
                      <Switch
                        checked={addEndFrame}
                        onCheckedChange={handleToggleEndFrame}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2">
                    <PanelImageUpload
                      images={firstFrameImages}
                      onImagesChange={setFirstFrameImages}
                      maxImages={1}
                      intent="video-frame"
                      title="First Frame"
                      compact
                    />
                    <ArrowLeftRight
                      aria-hidden
                      className="size-4 shrink-0 self-center text-muted-foreground/60"
                    />
                    <PanelImageUpload
                      images={lastFrameImages}
                      onImagesChange={setLastFrameImages}
                      maxImages={1}
                      intent="video-frame"
                      title="Last Frame"
                      compact
                      optional
                    />
                  </div>
                </div>
              ) : (
                // Default: single full-width dropzone. Add End Frame
                // switch lives in the card header to match the spec.
                <PanelImageUpload
                  images={firstFrameImages}
                  onImagesChange={setFirstFrameImages}
                  maxImages={1}
                  intent="video-frame"
                  title="Upload Image"
                  headerAction={
                    supportsLastFrame ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground/70">
                          Add End Frame
                        </span>
                        <Switch
                          checked={addEndFrame}
                          onCheckedChange={handleToggleEndFrame}
                        />
                      </div>
                    ) : undefined
                  }
                />
              )
            ) : (
              <div className="space-y-3">
                <PanelImageUpload
                  images={referenceImages}
                  onImagesChange={setReferenceImages}
                  maxImages={maxReferenceImages}
                  intent="video-reference"
                  title={`Reference Images (max ${maxReferenceImages})`}
                />
                {supportsReferenceVideos && (
                  <>
                    <PanelMediaUpload
                      media={referenceVideos}
                      onMediaChange={setReferenceVideos}
                      kind="video"
                      intent="video-reference-video"
                      allowedTypes={REFERENCE_VIDEO_INTENT.allowedMimeTypes}
                      maxFileSize={REFERENCE_VIDEO_INTENT.maxFileSize}
                      maxItems={maxReferenceVideos}
                      totalDurationLimitSeconds={
                        supportsGeminiOmniReferenceVideo
                          ? GEMINI_OMNI_REFERENCE_VIDEO_MAX_DURATION_SECONDS
                          : 15
                      }
                      formatLabel={
                        supportsGeminiOmniReferenceVideo
                          ? 'mp4, mov · up to 30s'
                          : 'mp4, mov · 480-720p'
                      }
                      title="Reference Videos"
                    />
                    {supportsReferenceMedia && (
                      <>
                        <PanelMediaUpload
                          media={referenceAudios}
                          onMediaChange={setReferenceAudios}
                          kind="audio"
                          intent="video-reference-audio"
                          allowedTypes={REFERENCE_AUDIO_INTENT.allowedMimeTypes}
                          maxFileSize={REFERENCE_AUDIO_INTENT.maxFileSize}
                          maxItems={3}
                          totalDurationLimitSeconds={15}
                          formatLabel="mp3, wav"
                          title="Reference Audios"
                        />
                        <div className="flex items-center justify-between py-1">
                          <span className="text-sm font-medium text-foreground/70">
                            Return Last Frame
                          </span>
                          <Switch
                            checked={returnLastFrame}
                            onCheckedChange={setReturnLastFrame}
                          />
                        </div>
                      </>
                    )}
                    {supportsReferenceMedia && referenceLastFrameUrl && (
                      <div className="space-y-2 rounded-lg border bg-muted/40 p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground/70">
                            Last frame
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() =>
                              void downloadImage(
                                referenceLastFrameUrl,
                                generateDownloadFilename('image', prompt)
                              )
                            }
                          >
                            <Download className="mr-1 size-3" />
                            Download
                          </Button>
                        </div>
                        <img
                          src={referenceLastFrameUrl}
                          alt="Returned last frame"
                          className="max-h-40 w-full rounded-md object-contain"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Prompt */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground/70">
              Prompt
            </span>
            <button
              type="button"
              onClick={() => setPrompt('')}
              disabled={!prompt.trim()}
              aria-label="Clear prompt"
              className="inline-flex size-7 items-center justify-center rounded-md border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
            >
              <Eraser className="size-3.5" />
            </button>
          </div>
          <div className="rounded-lg border border-input dark:bg-[#333] bg-gray-200 overflow-hidden">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What do you want to create?"
              maxLength={promptMaxLength}
              rows={5}
              className="border-0 resize-y bg-transparent shadow-none focus-visible:ring-0 text-sm min-h-[180px] max-h-[320px]"
            />
            <div className="flex items-center justify-between px-3 pb-2.5">
              <PromptOptimizer
                mediaType="video"
                prompt={prompt}
                onPromptChange={setPrompt}
                imageUrl={firstFrameImages[0]?.r2Url}
              />
              <span className="text-[11px] text-muted-foreground/60">
                {prompt.length} / {promptMaxLength}
              </span>
            </div>
          </div>
          {/* Prompt ideas */}
          <div className="flex items-start gap-1.5 flex-wrap text-xs">
            <span className="text-muted-foreground/60 py-0.5">Ideas:</span>
            {visibleIdeas.map((idea) => (
              <button
                key={idea}
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors py-0.5 cursor-pointer"
                onClick={() => setPrompt(idea)}
              >
                {idea}
              </button>
            ))}
            <button
              type="button"
              className="text-muted-foreground/60 hover:text-foreground transition-colors p-0.5 cursor-pointer ml-auto"
              onClick={() => setIdeasSeed((s) => s + 1)}
            >
              <RefreshCw className="size-3" />
            </button>
          </div>
        </div>

        {/* Aspect Ratio */}
        {(!isImg2Vid || videoInputMode === 'reference') && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground/70">
              Aspect Ratio
            </span>
            <div className="flex flex-wrap gap-2">
              {availableAspectRatios.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setVideoAspectRatio(r.value)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                    videoAspectRatio === r.value
                      ? 'border-foreground/30 bg-foreground/10 text-foreground'
                      : 'border-border hover:border-muted-foreground/50'
                  )}
                >
                  <div className={r.iconClass} />
                  <span>{r.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Duration */}
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground/70">
            Duration
          </span>
          <Select value={duration} onValueChange={setVideoDuration}>
            <SelectTrigger className="w-full h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableDurations.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Resolution */}
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground/70">
            Resolution
          </span>
          <Select value={videoResolution} onValueChange={setVideoResolution}>
            <SelectTrigger className="w-full h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableResolutions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Audio toggle */}
        {modelSupportsAudio && (
          <div className="flex items-center justify-between py-1">
            <span className="text-sm font-medium text-foreground/70">
              Generate Audio
            </span>
            <Switch
              checked={generateAudio}
              onCheckedChange={setVideoGenerateAudio}
            />
          </div>
        )}
      </div>
      {/* Credits + Generate - fixed bottom */}
      <div className="shrink-0 space-y-3 pt-3 pb-3 px-4 bg-sidebar border-t border-border/50">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <CoinsIcon className="size-3.5" />
            Required Credits
          </span>
          <span className="font-medium">{totalCredits}</span>
        </div>
        <Button
          variant="generate"
          data-active={canGenerate}
          className="w-full h-11 text-sm"
          onClick={handleGenerate}
          disabled={!canGenerate}
        >
          {isSubmitting ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="size-4 mr-2" />
          )}
          Generate Video
        </Button>
      </div>
    </div>
  );
}
