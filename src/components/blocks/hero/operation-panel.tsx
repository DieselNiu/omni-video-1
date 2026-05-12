'use client';

import { useCaptchaGatedUpload } from '@/hooks/use-captcha-gated-upload';
import { useCreditBalance } from '@/hooks/use-credits';
import { cn } from '@/lib/utils';
import {
  DEFAULT_VIDEO_MODEL,
  calculateVideoCredits,
  getVideoModelConfig,
  getVideoModelOptions,
  getVideoModelOptionsForImageToVideo,
  getVideoModelOptionsForReference,
} from '@/video/config/video-models';
import {
  ChevronDown,
  Clock,
  FileText,
  Image as ImageIcon,
  Info,
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
import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

const tabs = [
  { id: 'image-to-video', icon: ImageIcon },
  { id: 'text-to-video', icon: Type },
  { id: 'reference-to-video', icon: Sparkles },
] as const;

type TabId = (typeof tabs)[number]['id'];

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
}

interface OperationPanelProps {
  isGenerating: boolean;
  onGenerate: (params: {
    model: string;
    prompt: string;
    image_urls?: string[];
    image_roles?: ('first_frame' | 'last_frame' | 'reference_image')[];
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
  const { data: userCredits = 0 } = useCreditBalance();

  const [activeTab, setActiveTab] = useState<TabId>('image-to-video');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_VIDEO_MODEL);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [generateAudio, setGenerateAudio] = useState(false);

  // Uploaded images state
  const [firstFrameImages, setFirstFrameImages] = useState<UploadedImage[]>([]);
  const [lastFrameImages, setLastFrameImages] = useState<UploadedImage[]>([]);
  const [referenceImages, setReferenceImages] = useState<UploadedImage[]>([]);
  const [endFrame, setEndFrame] = useState(false);
  const { uploadWithCaptcha, captchaDialog } = useCaptchaGatedUpload();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputTargetRef = useRef<'first_frame' | 'last_frame' | 'reference'>(
    'first_frame'
  );

  // Get current model config
  const isImageInput =
    activeTab === 'image-to-video' || activeTab === 'reference-to-video';
  const currentModelConfig = getVideoModelConfig(selectedModel, isImageInput);

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
  const supportsAudio =
    currentModelConfig?.supportsAudio &&
    !!currentModelConfig?.audioPremiumCredits;

  // Selected values with validation
  const [duration, setDuration] = useState(supportedDurations[0]);
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
        if (options.length > 0) setSelectedModel(options[0].value);
      }
      // Clear images
      setFirstFrameImages([]);
      setLastFrameImages([]);
      setReferenceImages([]);
      setEndFrame(false);
    },
    [selectedModel]
  );

  // Handle model change
  const handleModelChange = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      setShowModelDropdown(false);

      const config = getVideoModelConfig(modelId, isImageInput);
      if (!config) return;

      // Reset options to model defaults
      const durations = config.supportedDurations || [8];
      if (!durations.includes(duration)) setDuration(durations[0]);

      const resolutions = config.supportedResolutions || ['720p'];
      if (!resolutions.includes(resolution)) setResolution(resolutions[0]);

      const ratios = config.supportedAspectRatios || ['16:9'];
      if (!ratios.includes(aspectRatio)) setAspectRatio(ratios[0]);

      // Reset audio if new model doesn't support it
      if (!config.supportsAudio || !config.audioPremiumCredits) {
        setGenerateAudio(false);
      }
    },
    [isImageInput, duration, resolution, aspectRatio]
  );

  // File upload handler
  const handleFileUpload = useCallback(
    async (files: FileList) => {
      const target = fileInputTargetRef.current;
      const validFiles = Array.from(files)
        .slice(0, target === 'reference' ? 3 : 1)
        .filter((f) => {
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type))
            return false;
          if (f.size > 10 * 1024 * 1024) return false;
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
          const result = await uploadWithCaptcha(img.file, 'image-input');
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
    [uploadWithCaptcha]
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
    if (!prompt.trim() && activeTab === 'text-to-video') {
      validationToast(t('validation.promptRequired'));
      return;
    }

    // Check images for image/reference modes
    if (activeTab === 'image-to-video' && firstFrameImages.length === 0) {
      validationToast(t('validation.imageRequired'));
      return;
    }
    if (activeTab === 'reference-to-video' && referenceImages.length === 0) {
      validationToast(t('validation.referenceRequired'));
      return;
    }

    // Check uploads complete
    const allImages = [
      ...firstFrameImages,
      ...lastFrameImages,
      ...referenceImages,
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
      generationType = 'REFERENCE_2_VIDEO';
    }

    onGenerate({
      model: selectedModel,
      prompt: prompt.trim(),
      image_urls,
      image_roles,
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
    endFrame,
    selectedModel,
    aspectRatio,
    duration,
    resolution,
    generateAudio,
    supportsAudio,
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
              <img
                src={img.previewUrl}
                alt="Upload"
                className="size-full object-cover"
              />
              {img.uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="size-4 animate-spin text-white" />
                </div>
              )}
              {!img.uploading && (
                <button
                  type="button"
                  onClick={() => removeImage(img.id, target)}
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
    <div className="w-full lg:w-[480px] shrink-0 space-y-5">
      {captchaDialog}
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
      <div className="inline-flex w-full items-center rounded-xl bg-muted/60 p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-background text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'
              )}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline text-nowrap">
                {t(`tabs.${tab.id}`)}
              </span>
            </button>
          );
        })}
      </div>

      {/* AI model selector */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Layers className="size-4" />
          {t('aiModel')}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowModelDropdown(!showModelDropdown)}
            className="flex w-full items-center justify-between rounded-xl bg-muted/60 p-3"
          >
            <div className="flex items-center gap-3">
              {selectedModelOption?.logo ? (
                <img
                  src={selectedModelOption.logo}
                  alt=""
                  className="size-9 rounded-full"
                />
              ) : (
                <div className="size-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400" />
              )}
              <div className="text-left">
                <span className="text-sm font-semibold text-foreground">
                  {selectedModelOption?.label || selectedModel}
                </span>
                <p className="text-xs text-muted-foreground">
                  {creditsCost} {t('credits')}
                </p>
              </div>
            </div>
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground transition-transform',
                showModelDropdown && 'rotate-180'
              )}
            />
          </button>

          {/* Model dropdown */}
          {showModelDropdown && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
              {modelOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.comingSoon}
                  aria-disabled={option.comingSoon}
                  onClick={() =>
                    !option.comingSoon && handleModelChange(option.value)
                  }
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors',
                    selectedModel === option.value
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted',
                    option.comingSoon &&
                      'cursor-not-allowed opacity-60 hover:bg-transparent'
                  )}
                >
                  {option.logo ? (
                    <img
                      src={option.logo}
                      alt=""
                      className="size-5 rounded-full"
                    />
                  ) : null}
                  <span className="font-medium">{option.label}</span>
                  {option.comingSoon && (
                    <span className="ml-auto rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Coming soon
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* image upload - image-to-video */}
      {activeTab === 'image-to-video' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ImageIcon className="size-4" />
              {t('images')}
            </div>
            <div className="flex items-center gap-2">
              {currentModelConfig?.imageCapabilities?.flexibleMode && (
                <>
                  <span className="text-xs text-muted-foreground">
                    {t('addEndFrame')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEndFrame(!endFrame)}
                    className={cn(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                      endFrame ? 'bg-blue-500' : 'bg-muted'
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
              endFrame ? 'grid-cols-2' : 'grid-cols-1'
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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ImageIcon className="size-4" />
              {t('refImages')}
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {referenceImages.length}/3
            </span>
          </div>
          {renderUploadTile(referenceImages, 'reference', t('refRequired'), 3)}
          <p className="text-[11px] text-muted-foreground">{t('refHint')}</p>
        </div>
      )}

      {/* prompt */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="size-4" />
          {t('prompt')}
        </div>
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('promptPlaceholder')}
            maxLength={5000}
            rows={4}
            className="w-full resize-none rounded-xl bg-muted/60 p-3 pb-8 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="absolute bottom-2.5 right-3 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
            {prompt.length}/5000
          </span>
        </div>
      </div>

      {/* duration - dynamic button group */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Clock className="size-4" />
          {t('duration')}
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-muted/60 p-1">
          {supportedDurations.map((dur) => (
            <button
              key={dur}
              type="button"
              onClick={() => setDuration(dur)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                duration === dur
                  ? 'bg-background text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'
              )}
            >
              {dur}s
            </button>
          ))}
        </div>
      </div>

      {/* resolution */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Monitor className="size-4" />
          {t('resolution')}
        </div>
        <div className="inline-flex gap-1 rounded-xl bg-muted/60 p-1">
          {supportedResolutions.map((res) => (
            <button
              key={res}
              type="button"
              onClick={() => setResolution(res)}
              className={cn(
                'rounded-lg px-5 py-1.5 text-sm font-medium transition-all',
                resolution === res
                  ? 'bg-background text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'
              )}
            >
              {res}
            </button>
          ))}
        </div>
      </div>

      {/* aspect ratio */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <MonitorSmartphone className="size-4" />
          {t('aspectRatio')}
        </div>
        <div className="grid grid-cols-5 gap-2">
          {supportedAspectRatios.map((ar) => (
            <button
              key={ar}
              type="button"
              onClick={() => setAspectRatio(ar)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl p-3 transition-all',
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
        <div className="flex items-center justify-between rounded-xl bg-muted/60 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
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
              generateAudio ? 'bg-blue-500' : 'bg-muted'
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
          'w-full rounded-xl py-3.5 text-base font-semibold transition-all flex items-center justify-center gap-2',
          isGenerating
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        )}
      >
        {isGenerating ? (
          <>
            <Loader2 className="size-5 animate-spin" />
            {t('generating')}
          </>
        ) : (
          <>
            <Sparkles className="size-5" />
            {t('generate')}
          </>
        )}
      </button>

      {/* credits info */}
      <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
        <span>{t('cost')}</span>
        <span className="font-semibold text-foreground">{creditsCost}</span>
        <span>{t('credits')}</span>
        <Info className="size-3.5" />
        <span className="mx-1">|</span>
        <span>{t('available')}</span>
        <span className="font-semibold text-foreground">{userCredits}</span>
      </div>
    </div>
  );
}
