'use client';

import { PanelMediaUpload } from '@/components/app/panel-media-upload';
import { UploadedImagePreviewDialog } from '@/components/app/uploaded-image-preview-dialog';
import { useCaptchaGatedUpload } from '@/hooks/use-captcha-gated-upload';
import { cn } from '@/lib/utils';
import { getUploadIntentConfig } from '@/storage/intents';
import {
  DEFAULT_VIDEO_MODEL,
  calculateVideoCredits,
  getReferenceVideoModelConfig,
  getVideoModelConfig,
  getVideoModelOptions,
  getVideoModelOptionsForImageToVideo,
  getVideoModelOptionsForReference,
} from '@/video/config/video-models';
import {
  Check,
  ChevronDown,
  Clapperboard,
  Clock,
  Eraser,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Monitor,
  MonitorSmartphone,
  Music,
  Sparkles,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

const REFERENCE_VIDEO_INTENT = getUploadIntentConfig('video-reference-video');
const REFERENCE_AUDIO_INTENT = getUploadIntentConfig('video-reference-audio');
const REFERENCE_IMAGE_INTENT = getUploadIntentConfig('video-reference');
const REFERENCE_VIDEO_MIN_DURATION_SECONDS = 1.8;
const GEMINI_OMNI_REFERENCE_VIDEO_MAX_DURATION_SECONDS = 30;
const DEFAULT_VIDEO_PROMPT_MAX_LENGTH = 4000;
const GEMINI_OMNI_PROMPT_MAX_LENGTH = 20000;
const DEFAULT_REFERENCE_PROMPT = `Place the woman (ref vid) realistically into these locations(*). Never change the angle, framing, the woman, or the woman's pose. Never zoom in, never zoom out. Keep exactly the same angle and the same framing. (just---chng outfit).

* Museum - 1click
* Car showroom - 1click
* Next to the window of a skyscraper - 1click
* Next to the window on a bus - 1click
* Beside a wall in a metro station - 1click`;

const tabs = [
  { id: 'reference-to-video', icon: Sparkles },
  { id: 'image-to-video', icon: ImageIcon },
  { id: 'text-to-video', icon: Type },
] as const;

type TabId = (typeof tabs)[number]['id'];

// Prefer 5s as the default duration when supported (the documented default for
// Wan 2.7 and most models); otherwise fall back to the first supported value.
function pickDefaultDuration(durations: number[]): number {
  return durations.includes(5) ? 5 : durations[0];
}

function AspectRatioIcon({ ratio }: { ratio: string }) {
  const sizes: Record<string, { w: number; h: number }> = {
    '16:9': { w: 28, h: 16 },
    '9:16': { w: 14, h: 24 },
    '4:3': { w: 24, h: 18 },
    '3:4': { w: 16, h: 22 },
    '21:9': { w: 32, h: 14 },
    '1:1': { w: 20, h: 20 },
  };
  const size = sizes[ratio] || { w: 20, h: 20 };
  return (
    <div className="flex items-center justify-center h-7">
      <div
        className="rounded-[3px] bg-muted-foreground/50"
        style={{ width: size.w, height: size.h }}
      />
    </div>
  );
}

interface UploadedImage {
  id: string;
  file: File;
  previewUrl: string;
  r2Url?: string;
  uploading: boolean;
  error?: string;
  durationSeconds?: number;
}

interface OperationPanelProps {
  isGenerating: boolean;
  onGenerate: (params: {
    model: string;
    prompt: string;
    image_urls?: string[];
    image_roles?: ('first_frame' | 'last_frame' | 'reference_image')[];
    video_urls?: string[];
    audio_urls?: string[];
    return_last_frame?: boolean;
    inputVideoDurationSeconds?: number;
    aspect_ratio: string;
    duration: number;
    resolution: string;
    generationType: string;
    generate_audio?: boolean;
  }) => void;
}

export default function OperationPanel({
  isGenerating,
  onGenerate,
}: OperationPanelProps) {
  const t = useTranslations('HomePage.videoHero');

  const [activeTab, setActiveTab] = useState<TabId>('reference-to-video');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_VIDEO_MODEL);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_REFERENCE_PROMPT);
  const [generateAudio, setGenerateAudio] = useState(true);

  // Uploaded images state
  const [firstFrameImages, setFirstFrameImages] = useState<UploadedImage[]>([]);
  const [lastFrameImages, setLastFrameImages] = useState<UploadedImage[]>([]);
  const [referenceImages, setReferenceImages] = useState<UploadedImage[]>([]);
  const [referenceVideos, setReferenceVideos] = useState<UploadedImage[]>([]);
  const [referenceAudios, setReferenceAudios] = useState<UploadedImage[]>([]);
  const [returnLastFrame, setReturnLastFrame] = useState(false);
  const [endFrame, setEndFrame] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const { uploadWithCaptcha, captchaDialog } = useCaptchaGatedUpload();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputTargetRef = useRef<'first_frame' | 'last_frame' | 'reference'>(
    'first_frame'
  );

  // Get current model config
  const isImageInput =
    activeTab === 'image-to-video' || activeTab === 'reference-to-video';
  const generationTypeForConfig =
    activeTab === 'reference-to-video'
      ? 'REFERENCE_2_VIDEO'
      : activeTab === 'image-to-video' && endFrame
        ? 'FIRST_AND_LAST_FRAMES_2_VIDEO'
        : activeTab === 'image-to-video'
          ? 'IMAGE_2_VIDEO'
          : 'TEXT_2_VIDEO';
  const currentModelConfig = getVideoModelConfig(
    selectedModel,
    isImageInput,
    generationTypeForConfig
  );
  const imageInputModelConfig = getVideoModelConfig(
    selectedModel,
    true,
    'IMAGE_2_VIDEO'
  );
  const referenceVideoConfig = getReferenceVideoModelConfig(selectedModel);
  const supportsReferenceMedia = !!referenceVideoConfig?.supportsReferenceMedia;
  const supportsGeminiOmniReferenceVideo =
    activeTab === 'reference-to-video' && selectedModel === 'gemini-omni';
  const supportsReferenceVideos =
    supportsReferenceMedia || supportsGeminiOmniReferenceVideo;
  const maxReferenceVideos = supportsGeminiOmniReferenceVideo ? 1 : 3;
  const maxReferenceImages =
    supportsGeminiOmniReferenceVideo && referenceVideos.length > 0
      ? 5
      : (referenceVideoConfig?.imageCapabilities?.maxImages ??
        currentModelConfig?.imageCapabilities?.maxImages ??
        3);
  const promptMaxLength =
    selectedModel === 'gemini-omni'
      ? GEMINI_OMNI_PROMPT_MAX_LENGTH
      : DEFAULT_VIDEO_PROMPT_MAX_LENGTH;
  const referenceImagesLabel = t('refImages').replace(
    /\s*[(（][^)）]*[)）]/u,
    ''
  );
  const referenceImagesHint = t('refHint').replace(
    /1\s*[-–~〜]\s*3/g,
    `1-${maxReferenceImages}`
  );
  const referenceVideoDurationSeconds = useMemo(
    () =>
      referenceVideos.reduce(
        (sum, video) => sum + (video.durationSeconds ?? 0),
        0
      ),
    [referenceVideos]
  );

  // Get model options based on tab
  const modelOptions = useMemo(() => {
    if (activeTab === 'reference-to-video')
      return getVideoModelOptionsForReference();
    if (activeTab === 'image-to-video')
      return getVideoModelOptionsForImageToVideo();
    return getVideoModelOptions();
  }, [activeTab]);

  // Dynamic options from model config
  const supportedDurations = currentModelConfig?.supportedDurations || [8];
  const supportedResolutions = currentModelConfig?.supportedResolutions || [
    '720p',
  ];
  const supportedAspectRatios = currentModelConfig?.supportedAspectRatios || [
    '16:9',
  ];
  const supportsAudio = currentModelConfig?.supportsAudio === true;

  // Many supported durations (e.g. Seedance 4–15s) read better as a
  // continuous slider; a short list (e.g. Wan 5/10/15s) stays as buttons.
  const useDurationSlider = supportedDurations.length > 4;
  const minDuration = supportedDurations[0];
  const maxDuration = supportedDurations[supportedDurations.length - 1];
  const snapDuration = (value: number) =>
    supportedDurations.reduce((closest, d) =>
      Math.abs(d - value) < Math.abs(closest - value) ? d : closest
    );

  // Selected values with validation.
  const [duration, setDuration] = useState(
    pickDefaultDuration(supportedDurations)
  );
  const [resolution, setResolution] = useState(supportedResolutions[0]);
  const [aspectRatio, setAspectRatio] = useState(
    supportedAspectRatios[0] || '16:9'
  );

  // Calculate credits
  const backendModelId = currentModelConfig?.id || '';
  const creditsCost = calculateVideoCredits(
    backendModelId,
    duration,
    generateAudio && supportsAudio,
    resolution
  );

  // Handle tab change
  const handleTabChange = useCallback(
    (tab: TabId) => {
      setActiveTab(tab);
      // Check if current model is valid for new tab
      const options =
        tab === 'reference-to-video'
          ? getVideoModelOptionsForReference()
          : tab === 'image-to-video'
            ? getVideoModelOptionsForImageToVideo()
            : getVideoModelOptions();
      if (!options.find((o) => o.value === selectedModel)) {
        // Prefer the first selectable model; never auto-select a
        // coming-soon placeholder.
        const firstSelectable =
          options.find((o) => !o.comingSoon) ?? options[0];
        if (firstSelectable) setSelectedModel(firstSelectable.value);
      }
      // Clear images
      setFirstFrameImages([]);
      setLastFrameImages([]);
      setReferenceImages([]);
      setReferenceVideos([]);
      setReferenceAudios([]);
      setReturnLastFrame(false);
      setEndFrame(false);
    },
    [selectedModel]
  );

  // Handle model change
  const handleModelChange = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      setShowModelDropdown(false);

      const config = getVideoModelConfig(
        modelId,
        isImageInput,
        generationTypeForConfig
      );
      if (!config) return;

      // Reset options to model defaults
      const durations = config.supportedDurations || [8];
      if (!durations.includes(duration))
        setDuration(pickDefaultDuration(durations));

      const resolutions = config.supportedResolutions || ['720p'];
      if (!resolutions.includes(resolution)) setResolution(resolutions[0]);

      const ratios = config.supportedAspectRatios || ['16:9'];
      if (!ratios.includes(aspectRatio)) setAspectRatio(ratios[0]);

      // Reset audio if new model doesn't support it
      if (config.supportsAudio) {
        setGenerateAudio(true);
      } else {
        setGenerateAudio(false);
      }
      if (
        !getReferenceVideoModelConfig(modelId)?.supportsReferenceMedia &&
        modelId !== 'gemini-omni'
      ) {
        setReferenceVideos([]);
        setReferenceAudios([]);
        setReturnLastFrame(false);
      } else if (modelId === 'gemini-omni') {
        setReferenceAudios([]);
        setReturnLastFrame(false);
      }
    },
    [isImageInput, generationTypeForConfig, duration, resolution, aspectRatio]
  );

  useEffect(() => {
    if (!currentModelConfig) return;
    const durations = currentModelConfig.supportedDurations || [8];
    if (!durations.includes(duration)) {
      setDuration(pickDefaultDuration(durations));
    }

    const resolutions = currentModelConfig.supportedResolutions || ['720p'];
    if (!resolutions.includes(resolution)) {
      setResolution(resolutions[0]);
    }

    const ratios = currentModelConfig.supportedAspectRatios || ['16:9'];
    if (!ratios.includes(aspectRatio)) {
      setAspectRatio(ratios[0]);
    }

    if (!currentModelConfig.supportsAudio) {
      setGenerateAudio(false);
    }
    if (!supportsReferenceVideos) {
      setReferenceVideos([]);
      setReferenceAudios([]);
      setReturnLastFrame(false);
    } else if (!supportsReferenceMedia) {
      setReferenceAudios([]);
      setReturnLastFrame(false);
    }
  }, [
    currentModelConfig,
    duration,
    resolution,
    aspectRatio,
    supportsReferenceMedia,
    supportsReferenceVideos,
  ]);

  // File upload handler
  const handleFileUpload = useCallback(
    async (files: FileList) => {
      const target = fileInputTargetRef.current;
      const currentCount =
        target === 'reference'
          ? referenceImages.length
          : target === 'first_frame'
            ? firstFrameImages.length
            : lastFrameImages.length;
      const maxFiles = target === 'reference' ? maxReferenceImages : 1;
      const maxFileSize =
        target === 'reference'
          ? REFERENCE_IMAGE_INTENT.maxFileSize
          : 10 * 1024 * 1024;
      const remaining = Math.max(0, maxFiles - currentCount);
      const validFiles = Array.from(files)
        .slice(0, remaining)
        .filter((f) => {
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type))
            return false;
          if (f.size > maxFileSize) return false;
          return true;
        });

      const newImages: UploadedImage[] = validFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        uploading: true,
      }));

      const setter =
        target === 'first_frame'
          ? setFirstFrameImages
          : target === 'last_frame'
            ? setLastFrameImages
            : setReferenceImages;

      setter((prev) => [...prev, ...newImages]);

      for (const img of newImages) {
        try {
          const result = await uploadWithCaptcha(
            img.file,
            target === 'reference' ? 'video-reference' : 'image-input'
          );
          setter((prev) =>
            prev.map((i) =>
              i.id === img.id
                ? { ...i, r2Url: result.url, uploading: false }
                : i
            )
          );
        } catch {
          setter((prev) =>
            prev.map((i) =>
              i.id === img.id
                ? { ...i, uploading: false, error: 'Upload failed' }
                : i
            )
          );
        }
      }
    },
    [
      uploadWithCaptcha,
      maxReferenceImages,
      referenceImages.length,
      firstFrameImages.length,
      lastFrameImages.length,
    ]
  );

  const removeImage = useCallback(
    (id: string, target: 'first_frame' | 'last_frame' | 'reference') => {
      const setter =
        target === 'first_frame'
          ? setFirstFrameImages
          : target === 'last_frame'
            ? setLastFrameImages
            : setReferenceImages;
      setter((prev) => {
        const img = prev.find((i) => i.id === id);
        if (img) URL.revokeObjectURL(img.previewUrl);
        return prev.filter((i) => i.id !== id);
      });
    },
    []
  );

  const triggerUpload = useCallback(
    (target: 'first_frame' | 'last_frame' | 'reference') => {
      fileInputTargetRef.current = target;
      fileInputRef.current?.click();
    },
    []
  );

  // Handle generate
  const handleGenerate = useCallback(() => {
    if (isGenerating) return;
    const validationToast = (message: string) =>
      toast(message, {
        cancel: { label: t('validation.close'), onClick: () => {} },
        classNames: { title: 'flex-1 text-center' },
      });
    if (
      !prompt.trim() &&
      (activeTab === 'text-to-video' ||
        (activeTab === 'reference-to-video' &&
          supportsGeminiOmniReferenceVideo))
    ) {
      validationToast(t('validation.promptRequired'));
      return;
    }

    // Check images for image/reference modes
    if (activeTab === 'image-to-video' && firstFrameImages.length === 0) {
      validationToast(t('validation.imageRequired'));
      return;
    }
    if (
      activeTab === 'reference-to-video' &&
      referenceImages.length === 0 &&
      (!supportsReferenceVideos ||
        !referenceVideos.some((video) => video.r2Url || video.uploading))
    ) {
      validationToast(t('validation.referenceRequired'));
      return;
    }
    if (
      activeTab === 'reference-to-video' &&
      referenceImages.length > maxReferenceImages
    ) {
      validationToast(
        `Use up to ${maxReferenceImages} reference image${maxReferenceImages === 1 ? '' : 's'} for this model.`
      );
      return;
    }

    // Check uploads complete
    const allImages = [
      ...firstFrameImages,
      ...lastFrameImages,
      ...referenceImages,
      ...referenceVideos,
      ...referenceAudios,
    ];
    if (allImages.some((img) => img.uploading)) {
      validationToast(t('validation.uploading'));
      return;
    }

    // Build image_urls and image_roles
    let image_urls: string[] | undefined;
    let image_roles:
      | ('first_frame' | 'last_frame' | 'reference_image')[]
      | undefined;
    let video_urls: string[] | undefined;
    let audio_urls: string[] | undefined;
    let generationType = 'TEXT_2_VIDEO';

    if (activeTab === 'image-to-video') {
      const urls: string[] = [];
      const roles: ('first_frame' | 'last_frame' | 'reference_image')[] = [];

      for (const img of firstFrameImages) {
        if (img.r2Url) {
          urls.push(img.r2Url);
          roles.push('first_frame');
        }
      }
      if (endFrame) {
        for (const img of lastFrameImages) {
          if (img.r2Url) {
            urls.push(img.r2Url);
            roles.push('last_frame');
          }
        }
      }

      image_urls = urls.length > 0 ? urls : undefined;
      image_roles = roles.length > 0 ? roles : undefined;
      generationType =
        endFrame && lastFrameImages.length > 0
          ? 'FIRST_AND_LAST_FRAMES_2_VIDEO'
          : 'IMAGE_2_VIDEO';
    } else if (activeTab === 'reference-to-video') {
      const urls: string[] = [];
      const roles: ('first_frame' | 'last_frame' | 'reference_image')[] = [];
      for (const img of referenceImages) {
        if (img.r2Url) {
          urls.push(img.r2Url);
          roles.push('reference_image');
        }
      }
      image_urls = urls.length > 0 ? urls : undefined;
      image_roles = roles.length > 0 ? roles : undefined;
      if (supportsReferenceVideos) {
        const videoUrls = referenceVideos
          .map((video) => video.r2Url)
          .filter((url): url is string => !!url)
          .slice(0, maxReferenceVideos);
        const audioUrls = referenceAudios
          .map((audio) => audio.r2Url)
          .filter((url): url is string => !!url)
          .slice(0, 3);
        video_urls = videoUrls.length > 0 ? videoUrls : undefined;
        audio_urls =
          supportsReferenceMedia && audioUrls.length > 0
            ? audioUrls
            : undefined;
        if (
          supportsReferenceMedia &&
          video_urls &&
          referenceVideoDurationSeconds <= REFERENCE_VIDEO_MIN_DURATION_SECONDS
        ) {
          validationToast(
            `Reference videos must total more than ${REFERENCE_VIDEO_MIN_DURATION_SECONDS}s.`
          );
          return;
        }
      }
      generationType = 'REFERENCE_2_VIDEO';
    }

    onGenerate({
      model: selectedModel,
      prompt: prompt.trim(),
      image_urls,
      image_roles,
      video_urls,
      audio_urls,
      return_last_frame:
        generationType === 'REFERENCE_2_VIDEO' &&
        supportsReferenceMedia &&
        returnLastFrame,
      inputVideoDurationSeconds:
        video_urls && video_urls.length > 0
          ? referenceVideoDurationSeconds
          : undefined,
      aspect_ratio: aspectRatio,
      duration,
      resolution,
      generationType,
      generate_audio: supportsAudio ? generateAudio : undefined,
    });
  }, [
    isGenerating,
    prompt,
    activeTab,
    firstFrameImages,
    lastFrameImages,
    referenceImages,
    referenceVideos,
    referenceAudios,
    returnLastFrame,
    referenceVideoDurationSeconds,
    endFrame,
    selectedModel,
    aspectRatio,
    duration,
    resolution,
    generateAudio,
    supportsAudio,
    supportsReferenceMedia,
    supportsReferenceVideos,
    supportsGeminiOmniReferenceVideo,
    maxReferenceImages,
    maxReferenceVideos,
    onGenerate,
    t,
  ]);

  const selectedModelOption = modelOptions.find(
    (m) => m.value === selectedModel
  );

  // Render upload tile
  const renderUploadTile = (
    images: UploadedImage[],
    target: 'first_frame' | 'last_frame' | 'reference',
    label: string,
    maxImages = 1
  ) => (
    <div className="space-y-2">
      {/* Uploaded images */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative size-16 overflow-hidden rounded-lg"
            >
              <button
                type="button"
                className="size-full cursor-zoom-in"
                onClick={() => setPreviewImageUrl(img.previewUrl)}
                aria-label="Preview uploaded image"
              >
                <img
                  src={img.previewUrl}
                  alt="Upload"
                  className="size-full object-cover"
                />
              </button>
              {img.uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="size-4 animate-spin text-white" />
                </div>
              )}
              {!img.uploading && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeImage(img.id, target);
                  }}
                  className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {images.length < maxImages && (
        <button
          type="button"
          onClick={() => triggerUpload(target)}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/30 p-4 text-center hover:border-muted-foreground/40 transition-colors cursor-pointer"
        >
          <div className="flex size-8 items-center justify-center rounded-full bg-blue-500/10">
            <Upload className="size-4 text-blue-500" />
          </div>
          <p className="text-xs font-medium text-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground">
            PNG, JPG, JPEG, WEBP
          </p>
        </button>
      )}
    </div>
  );

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-5">
      {captchaDialog}
      <UploadedImagePreviewDialog
        src={previewImageUrl}
        open={!!previewImageUrl}
        onOpenChange={(open) => {
          if (!open) setPreviewImageUrl(null);
        }}
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFileUpload(e.target.files);
          e.target.value = '';
        }}
      />

      {/* tabs */}
      <div className="grid w-full grid-cols-1 gap-1 rounded-xl bg-muted/60 p-1 min-[440px]:grid-cols-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                'inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-xs font-medium transition-all 2xl:gap-2 2xl:px-3 2xl:text-sm',
                activeTab === tab.id
                  ? 'bg-background text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="whitespace-nowrap">{t(`tabs.${tab.id}`)}</span>
            </button>
          );
        })}
      </div>

      {/* AI model selector */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Layers className="size-4" />
          {t('aiModel')}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowModelDropdown(!showModelDropdown)}
            className="flex w-full min-w-0 items-center justify-between rounded-xl border border-border/60 bg-muted/40 px-3 py-3 transition-colors hover:bg-muted/60 sm:px-4"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              {selectedModelOption?.emoji ? (
                <span className="flex size-5 shrink-0 items-center justify-center text-base leading-none">
                  {selectedModelOption.emoji}
                </span>
              ) : selectedModelOption?.logo ? (
                <img
                  src={selectedModelOption.logo}
                  alt=""
                  className="size-5 shrink-0 rounded-full"
                />
              ) : (
                <div className="size-5 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400" />
              )}
              <span className="min-w-0 truncate text-sm font-semibold text-foreground sm:text-base">
                {selectedModelOption?.label || selectedModel}
              </span>
              {selectedModelOption?.tagline && (
                <span className="hidden truncate text-sm text-muted-foreground sm:inline">
                  {selectedModelOption.tagline}
                </span>
              )}
            </div>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                showModelDropdown && 'rotate-180'
              )}
            />
          </button>

          {/* Model dropdown */}
          {showModelDropdown && (
            <div className="absolute top-full left-0 right-0 z-50 mt-2 max-h-72 overflow-y-auto rounded-xl border border-border/60 bg-popover p-1.5 shadow-xl">
              {modelOptions.map((option) => {
                const isSelected = selectedModel === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={option.comingSoon}
                    aria-disabled={option.comingSoon}
                    onClick={() =>
                      !option.comingSoon && handleModelChange(option.value)
                    }
                    className={cn(
                      'flex w-full min-w-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
                      isSelected ? 'bg-accent' : 'hover:bg-muted',
                      option.comingSoon &&
                        'cursor-not-allowed opacity-60 hover:bg-transparent'
                    )}
                  >
                    <Check
                      className={cn(
                        'size-4 shrink-0 text-foreground',
                        isSelected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {option.emoji ? (
                      <span className="flex size-5 shrink-0 items-center justify-center text-base leading-none">
                        {option.emoji}
                      </span>
                    ) : option.logo ? (
                      <img
                        src={option.logo}
                        alt=""
                        className="size-5 shrink-0 rounded-full"
                      />
                    ) : null}
                    <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                      {option.label}
                    </span>
                    {option.tagline && (
                      <span className="truncate text-sm text-muted-foreground">
                        {option.tagline}
                      </span>
                    )}
                    {option.comingSoon && (
                      <span className="ml-auto shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:px-2">
                        Coming soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* image upload - image-to-video */}
      {activeTab === 'image-to-video' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ImageIcon className="size-4" />
              {t('images')}
            </div>
            <div className="flex items-center gap-2">
              {imageInputModelConfig?.imageCapabilities?.flexibleMode && (
                <>
                  <span className="text-xs text-muted-foreground">
                    {t('addEndFrame')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEndFrame(!endFrame)}
                    className={cn(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                      endFrame ? 'bg-[#6359a6]' : 'bg-muted'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block size-3.5 rounded-full bg-white transition-transform',
                        endFrame ? 'translate-x-[18px]' : 'translate-x-[3px]'
                      )}
                    />
                  </button>
                </>
              )}
            </div>
          </div>
          <div
            className={cn(
              'grid gap-3',
              endFrame ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
            )}
          >
            {renderUploadTile(
              firstFrameImages,
              'first_frame',
              t('uploadHint'),
              1
            )}
            {endFrame &&
              renderUploadTile(
                lastFrameImages,
                'last_frame',
                t('endFrameHint'),
                1
              )}
          </div>
        </div>
      )}

      {/* reference images upload */}
      {activeTab === 'reference-to-video' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ImageIcon className="size-4" />
              {referenceImagesLabel}
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {referenceImages.length}/{maxReferenceImages}
            </span>
          </div>
          {renderUploadTile(
            referenceImages,
            'reference',
            t('refRequired'),
            maxReferenceImages
          )}
          <p className="text-[11px] text-muted-foreground">
            {referenceImagesHint}
          </p>
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
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3">
                    <span className="text-sm font-medium text-foreground">
                      Return Last Frame
                    </span>
                    <button
                      type="button"
                      onClick={() => setReturnLastFrame(!returnLastFrame)}
                      className={cn(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                        returnLastFrame ? 'bg-[#6359a6]' : 'bg-muted'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block size-3.5 rounded-full bg-white transition-transform',
                          returnLastFrame
                            ? 'translate-x-[18px]'
                            : 'translate-x-[3px]'
                        )}
                      />
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* prompt */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="size-4" />
            {t('prompt')}
          </div>
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
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('promptPlaceholder')}
            maxLength={promptMaxLength}
            rows={4}
            className="w-full resize-y rounded-xl bg-muted/60 p-3 pb-8 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="absolute bottom-2.5 right-3 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
            {prompt.length}/{promptMaxLength}
          </span>
        </div>
      </div>

      {/* duration - slider for many options, button group for few */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock className="size-4" />
            {t('duration')}
          </div>
          {useDurationSlider && (
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {duration}s
            </span>
          )}
        </div>
        {useDurationSlider ? (
          <div className="space-y-1.5 pt-1">
            <input
              type="range"
              min={minDuration}
              max={maxDuration}
              step={1}
              value={duration}
              onChange={(e) =>
                setDuration(snapDuration(Number(e.target.value)))
              }
              className="w-full cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{minDuration}s</span>
              <span>{maxDuration}s</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
            {supportedDurations.map((dur) => (
              <button
                key={dur}
                type="button"
                onClick={() => setDuration(dur)}
                className={cn(
                  'rounded-xl border px-2 py-3 text-center transition-all sm:flex-1',
                  duration === dur
                    ? 'border-border bg-muted text-foreground shadow-sm'
                    : 'border-border/60 bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                )}
              >
                <div className="text-sm font-semibold">{dur}s</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {dur} {t('seconds')}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* resolution */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Monitor className="size-4" />
          {t('resolution')}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
          {supportedResolutions.map((res) => (
            <button
              key={res}
              type="button"
              onClick={() => setResolution(res)}
              className={cn(
                'rounded-xl border px-2 py-3 text-sm font-semibold transition-all sm:flex-1 sm:py-3.5',
                resolution === res
                  ? 'border-border bg-muted text-foreground shadow-sm'
                  : 'border-border/60 bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              )}
            >
              {res}
            </button>
          ))}
        </div>
      </div>

      {/* aspect ratio */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MonitorSmartphone className="size-4" />
          {t('aspectRatio')}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {supportedAspectRatios.map((ar) => (
            <button
              key={ar}
              type="button"
              onClick={() => setAspectRatio(ar)}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl p-2 transition-all sm:p-3',
                aspectRatio === ar
                  ? 'bg-background border border-foreground/20 text-foreground shadow-sm'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent'
              )}
            >
              {ar === 'Auto' ? (
                <Sparkles className="size-5" />
              ) : (
                <AspectRatioIcon ratio={ar} />
              )}
              <span className="text-[11px]">{ar}</span>
            </button>
          ))}
        </div>
      </div>

      {/* audio toggle */}
      {supportsAudio && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium text-foreground">
            <Music className="size-4" />
            Audio
            {currentModelConfig?.audioPremiumCredits && (
              <span className="text-xs text-muted-foreground">
                (+{currentModelConfig.audioPremiumCredits * duration}{' '}
                {t('credits')})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setGenerateAudio(!generateAudio)}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              generateAudio ? 'bg-[#6359a6]' : 'bg-muted'
            )}
          >
            <span
              className={cn(
                'inline-block size-3.5 rounded-full bg-white transition-transform',
                generateAudio ? 'translate-x-[18px]' : 'translate-x-[3px]'
              )}
            />
          </button>
        </div>
      )}

      {/* generate button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isGenerating}
        className={cn(
          'w-full rounded-full py-3.5 text-base font-semibold transition-all flex items-center justify-center gap-2',
          isGenerating
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : 'bg-[#6359a6] text-white hover:bg-[#564d8c]'
        )}
      >
        {isGenerating ? (
          <>
            <Loader2 className="size-5 animate-spin" />
            {t('generating')}
          </>
        ) : (
          <>
            <span className="min-w-0 truncate">
              {t('generate')} · {creditsCost} {t('credits')}
            </span>
            <Clapperboard className="size-5" />
          </>
        )}
      </button>
    </div>
  );
}
