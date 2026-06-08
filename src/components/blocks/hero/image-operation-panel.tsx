'use client';

import { UploadedImagePreviewDialog } from '@/components/app/uploaded-image-preview-dialog';
import { useCaptchaGatedUpload } from '@/hooks/use-captcha-gated-upload';
import { useToast } from '@/hooks/use-toast';
import { useUploadLoginGate } from '@/hooks/use-upload-login-gate';
import {
  IMAGE_MODELS,
  calculateImageCredits,
  getDefaultImageResolution,
  getHomeImageModelOption,
  getHomeImageModelOptions,
  supportsImageResolutionSelection,
} from '@/image/config/image-models';
import { cn } from '@/lib/utils';
import type { HomeQuotaState } from '@/stores/home-image-store';
import { useHomeImageStore } from '@/stores/home-image-store';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Eraser,
  Loader2,
  RotateCcw,
  Settings,
  Upload,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SCENE_PRESETS, STYLE_PRESETS } from './image-presets';

const tabs = [{ id: 'text-to-image' }, { id: 'image-to-image' }] as const;

type TabId = (typeof tabs)[number]['id'];

function ModelIcon({ src, alt }: { src: string; alt: string }) {
  // These are tiny local static icons. Bypass the Next image optimizer
  // (`unoptimized`) and load eagerly so they don't re-fetch through
  // /_next/image every time the conditionally-rendered dropdown remounts —
  // the raw asset is served directly and served from browser cache after
  // the first paint, so there's no per-open loading flash.
  return (
    <Image
      src={src}
      alt={alt}
      width={20}
      height={20}
      unoptimized
      loading="eager"
      className="size-5 shrink-0 rounded-[4px]"
    />
  );
}

function AspectRatioIcon({ ratio }: { ratio: string }) {
  const sizes: Record<string, { w: number; h: number }> = {
    '1:1': { w: 15, h: 15 },
    '16:9': { w: 21, h: 12 },
    '9:16': { w: 11, h: 18 },
    '4:3': { w: 18, h: 14 },
    '3:4': { w: 13, h: 17 },
  };
  const size = sizes[ratio] || { w: 15, h: 15 };
  return (
    <div className="flex items-center justify-center h-5">
      <div
        className="rounded-[2px] bg-muted-foreground/50"
        style={{ width: size.w, height: size.h }}
      />
    </div>
  );
}

interface ImageOperationPanelProps {
  isGenerating: boolean;
  quota: HomeQuotaState | null;
  onGenerate: (params: {
    modelId: string;
    prompt: string;
    mode: 'text-to-image' | 'image-to-image';
    imageUrls?: string[];
    aspectRatio: string;
    resolution?: string;
  }) => void;
}

interface UploadedImage {
  id: string;
  file: File;
  previewUrl: string;
  r2Url?: string;
  uploading: boolean;
  error?: string;
}

export default function ImageOperationPanel({
  isGenerating,
  quota,
  onGenerate,
}: ImageOperationPanelProps) {
  const t = useTranslations('HomePage.imageHero');
  const { toast } = useToast();

  // Homepage hero exposes a single model — the home-anonymous surface
  // default. Read it from the same surface config the submit route
  // gates on, so the picker can never offer something the surface
  // would later reject.
  const homeModelOption = getHomeImageModelOption();
  const modelOptions = getHomeImageModelOptions();
  const [activeTab, setActiveTab] = useState<TabId>('text-to-image');
  const [activeStyleTab, setActiveStyleTab] = useState<'styles' | 'scenes'>(
    'styles'
  );
  const [selectedModel, setSelectedModel] = useState(homeModelOption.value);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [resolution, setResolution] = useState<string>(
    getDefaultImageResolution(homeModelOption.value) ?? '1K'
  );
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const { uploadWithCaptcha, captchaDialog } = useCaptchaGatedUpload();
  const gateUpload = useUploadLoginGate();

  // Template picked from the preview panel's gallery flows in through the
  // store. Sync it into the local prompt + selected style whenever the nonce
  // advances (re-applies even when the same template is chosen twice).
  const templateSelection = useHomeImageStore((s) => s.templateSelection);
  const templateNonce = templateSelection?.nonce;
  useEffect(() => {
    if (!templateSelection) return;
    setPrompt(templateSelection.prompt);
    setSelectedStyle(templateSelection.styleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateNonce]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Horizontal preset carousel: track scroll edges so we can show/hide the
  // left/right arrow affordances (macOS hides the native scrollbar, so the
  // overflow isn't otherwise discoverable).
  const presetScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updatePresetScrollState = useCallback(() => {
    const el = presetScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  const scrollPresets = useCallback((direction: 'left' | 'right') => {
    const el = presetScrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction === 'left' ? -el.clientWidth * 0.8 : el.clientWidth * 0.8,
      behavior: 'smooth',
    });
  }, []);

  // Re-evaluate arrow visibility when the preset set changes (tab switch) and
  // once after mount so the right arrow shows when content overflows.
  useEffect(() => {
    updatePresetScrollState();
  }, [updatePresetScrollState, activeStyleTab]);

  const currentModel = IMAGE_MODELS[selectedModel];
  const supportedAspectRatios = currentModel?.supportedAspectRatios || ['1:1'];
  const supportedResolutions = currentModel?.supportedResolutions || [];
  const showResolution = supportsImageResolutionSelection(selectedModel);

  const creditsCost = calculateImageCredits(
    selectedModel,
    showResolution ? resolution : undefined
  );

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    // Surface still only exposes one model regardless of mode; keep
    // the current selection (it's always valid).
    if (tab === 'text-to-image') {
      setUploadedImages([]);
    }
  }, []);

  const handleFileUpload = useCallback(
    async (files: FileList) => {
      const maxImages = currentModel?.maxInputImages || 5;
      const remaining = maxImages - uploadedImages.length;
      if (remaining <= 0) return;

      const validFiles = Array.from(files)
        .slice(0, remaining)
        .filter((file) => {
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            return false;
          }
          if (file.size > 10 * 1024 * 1024) {
            return false;
          }
          return true;
        });

      const newImages: UploadedImage[] = validFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        uploading: true,
      }));

      setUploadedImages((prev) => [...prev, ...newImages]);

      for (const image of newImages) {
        try {
          const result = await uploadWithCaptcha(image.file, 'image-input');
          setUploadedImages((prev) =>
            prev.map((item) =>
              item.id === image.id
                ? { ...item, r2Url: result.url, uploading: false }
                : item
            )
          );
        } catch {
          setUploadedImages((prev) =>
            prev.map((item) =>
              item.id === image.id
                ? { ...item, uploading: false, error: 'Upload failed' }
                : item
            )
          );
        }
      }
    },
    [currentModel, uploadedImages.length, uploadWithCaptcha]
  );

  const removeImage = useCallback((id: string) => {
    setUploadedImages((prev) => {
      const image = prev.find((item) => item.id === id);
      if (image) {
        URL.revokeObjectURL(image.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const handleGenerate = useCallback(() => {
    if (isGenerating) return;

    // When quota is already exhausted, defer to the parent so it can pop the
    // login / cooldown / upgrade gate. Skipping input validation here means
    // the gate fires even before the user has filled in a prompt or image.
    const quotaBlocked = Boolean(quota?.exhausted);

    if (!quotaBlocked) {
      if (!prompt.trim() && activeTab === 'text-to-image') {
        toast({ title: t('validation.promptRequired') });
        return;
      }
      if (activeTab === 'image-to-image' && uploadedImages.length === 0) {
        toast({ title: t('validation.imageRequired') });
        return;
      }
      if (uploadedImages.some((image) => image.uploading)) {
        toast({ title: t('validation.uploading') });
        return;
      }
    }

    const imageUrls = uploadedImages
      .filter((image) => image.r2Url)
      .map((image) => image.r2Url!);

    const composedPrompt = prompt.trim().replace(/\[SUBJECT\]/g, 'the subject');

    onGenerate({
      modelId: selectedModel,
      prompt: composedPrompt,
      mode: activeTab,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      aspectRatio,
      resolution: showResolution ? resolution : undefined,
    });
  }, [
    activeTab,
    aspectRatio,
    isGenerating,
    onGenerate,
    prompt,
    quota?.exhausted,
    resolution,
    selectedModel,
    showResolution,
    t,
    toast,
    uploadedImages,
  ]);

  const handleReset = useCallback(() => {
    if (isGenerating) return;
    setPrompt('');
    setSelectedStyle(null);
    setUploadedImages((prev) => {
      for (const image of prev) {
        URL.revokeObjectURL(image.previewUrl);
      }
      return [];
    });
  }, [isGenerating]);

  const handleModelChange = useCallback((id: string, comingSoon?: boolean) => {
    if (comingSoon) return;
    setSelectedModel(id);
    setResolution(getDefaultImageResolution(id) ?? '1K');
    setShowModelDropdown(false);
  }, []);

  const selectedModelOption =
    modelOptions.find((o) => o.value === selectedModel) ?? homeModelOption;

  const activePresets =
    activeStyleTab === 'scenes' ? SCENE_PRESETS : STYLE_PRESETS;

  return (
    <div className="w-full min-w-0 space-y-5 sm:space-y-6">
      {captchaDialog}
      <UploadedImagePreviewDialog
        src={previewImageUrl}
        open={!!previewImageUrl}
        onOpenChange={(open) => {
          if (!open) setPreviewImageUrl(null);
        }}
      />

      <div className="flex items-center gap-2">
        <Settings className="size-5 text-foreground" />
        <span className="text-base font-semibold text-foreground">
          {t('configTitle')}
        </span>
      </div>
      {/* Select Model */}
      <div className="space-y-2">
        <div className="text-sm font-medium text-foreground">
          {t('selectModel')}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowModelDropdown((v) => !v)}
            className="flex w-full min-w-0 items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5 text-left"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <ModelIcon
                src={selectedModelOption.icon || selectedModelOption.logo || ''}
                alt={selectedModelOption.label}
              />
              <span className="min-w-0 truncate text-sm font-medium text-foreground">
                {selectedModelOption.label}
              </span>
              {selectedModelOption.badge && (
                <span className="rounded bg-green-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {selectedModelOption.badge}
                </span>
              )}
            </div>
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground transition-transform',
                showModelDropdown && 'rotate-180'
              )}
            />
          </button>

          {showModelDropdown && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border bg-popover p-1 shadow-lg">
              {modelOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleModelChange(option.value)}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm transition-colors',
                    selectedModel === option.value
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  <span className="flex w-4 shrink-0 justify-center">
                    {selectedModel === option.value && (
                      <Check className="size-4" />
                    )}
                  </span>
                  <ModelIcon
                    src={option.icon || option.logo || ''}
                    alt={option.label}
                  />
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {option.label}
                  </span>
                  {option.badge && (
                    <span className="ml-1 rounded bg-green-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {option.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Generation Mode */}
      <div className="space-y-2">
        <div className="text-sm font-medium text-foreground">
          {t('generationMode')}
        </div>
        <div className="grid w-full grid-cols-2 rounded-full bg-muted/60 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                'inline-flex min-w-0 items-center justify-center rounded-full px-2 py-2 text-xs font-medium transition-all sm:px-3 sm:text-sm',
                activeTab === tab.id
                  ? 'bg-background text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'
              )}
            >
              <span className="truncate">{t(`tabs.${tab.id}`)}</span>
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'image-to-image' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-foreground">
              {t('sourceImage')}
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {uploadedImages.length}/{currentModel?.maxInputImages || 5}
            </span>
          </div>

          {uploadedImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {uploadedImages.map((image) => (
                <div
                  key={image.id}
                  className="group relative size-16 overflow-hidden rounded-lg"
                >
                  <button
                    type="button"
                    className="size-full cursor-zoom-in"
                    onClick={() => setPreviewImageUrl(image.previewUrl)}
                    aria-label="Preview uploaded image"
                  >
                    <img
                      src={image.previewUrl}
                      alt="Upload"
                      className="size-full object-cover"
                    />
                  </button>
                  {image.uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="size-4 animate-spin text-white" />
                    </div>
                  )}
                  {image.error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-500/60">
                      <span className="text-[10px] text-white">Error</span>
                    </div>
                  )}
                  {!image.uploading && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeImage(image.id);
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

          {uploadedImages.length < (currentModel?.maxInputImages || 5) && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) {
                    void handleFileUpload(event.target.files);
                  }
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => {
                  // image-input requires login — pop the dialog on click,
                  // before the file picker opens.
                  if (!gateUpload('image-input')) return;
                  fileInputRef.current?.click();
                }}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/30 p-6 text-center transition-colors hover:border-muted-foreground/40 cursor-pointer"
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-transparent">
                  <Upload className="size-5 text-foreground/70" />
                </div>
                <p className="text-xs font-medium text-foreground">
                  {t('uploadHint')}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  PNG, JPG, JPEG, WEBP
                </p>
              </button>
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-foreground">
            {t('editDescription')}
          </div>
          <button
            type="button"
            onClick={() => setPrompt('')}
            disabled={!prompt.trim()}
            aria-label={t('clearDescription')}
            className="inline-flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent text-foreground"
          >
            <Eraser className="size-3.5" />
          </button>
        </div>
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={t('promptPlaceholder')}
            maxLength={5000}
            rows={4}
            className="w-full resize-y rounded-xl bg-muted/60 p-3 pb-8 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="absolute bottom-2.5 right-3 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
            {prompt.length}/5000
          </span>
        </div>
      </div>

      {showResolution && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">
            {t('resolution')}
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-muted/60 p-1 sm:inline-flex">
            {supportedResolutions.map((supportedResolution) => (
              <button
                key={supportedResolution}
                type="button"
                onClick={() => setResolution(supportedResolution)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4',
                  resolution === supportedResolution
                    ? 'bg-background text-foreground shadow-sm border border-border'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                )}
              >
                {supportedResolution}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-sm font-medium text-foreground">
          {t('aspectRatio')}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {supportedAspectRatios.map((supportedAspectRatio) => (
            <button
              key={supportedAspectRatio}
              type="button"
              onClick={() => setAspectRatio(supportedAspectRatio)}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg p-2 transition-all',
                aspectRatio === supportedAspectRatio
                  ? 'bg-background border border-foreground/20 text-foreground shadow-sm'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent'
              )}
            >
              <AspectRatioIcon ratio={supportedAspectRatio} />
              <span className="text-[10px]">{supportedAspectRatio}</span>
            </button>
          ))}
        </div>
      </div>

      {/* reset + generate */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={handleReset}
          disabled={isGenerating}
          aria-label={t('reset')}
          className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RotateCcw className="size-5" />
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className={cn(
            'flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4 py-3.5 text-base font-semibold transition-all',
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

      {/* Styles / Scenes presets */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-muted/60 p-1 sm:inline-flex">
            {(['styles', 'scenes'] as const).map((tabId) => {
              const count =
                tabId === 'scenes'
                  ? SCENE_PRESETS.length
                  : STYLE_PRESETS.length;
              const isActive = activeStyleTab === tabId;
              return (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => setActiveStyleTab(tabId)}
                  className={cn(
                    'inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4',
                    isActive
                      ? 'bg-background text-foreground shadow-sm border border-border'
                      : 'text-muted-foreground hover:text-foreground border border-transparent'
                  )}
                >
                  {tabId === 'scenes' ? t('scenesTitle') : t('styles.title')}
                  <span className="text-xs text-muted-foreground">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Scroll presets left"
              onClick={() => scrollPresets('left')}
              disabled={!canScrollLeft}
              className="flex size-9 items-center justify-center rounded-xl border bg-muted/40 text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-muted/40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Scroll presets right"
              onClick={() => scrollPresets('right')}
              disabled={!canScrollRight}
              className="flex size-9 items-center justify-center rounded-xl border bg-muted/40 text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-muted/40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
        <div className="relative">
          <div
            ref={presetScrollRef}
            onScroll={updatePresetScrollState}
            className="-mx-1 flex gap-2 overflow-x-auto scroll-smooth px-1 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {activePresets.map((preset) => {
              const isSelected = selectedStyle === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setSelectedStyle(preset.id);
                    setPrompt(preset.prompt);
                  }}
                  className="group flex w-24 shrink-0 flex-col items-center gap-1.5"
                >
                  <div
                    className={cn(
                      'relative size-24 overflow-hidden rounded-xl bg-muted transition-all',
                      isSelected
                        ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                        : 'opacity-90 group-hover:opacity-100'
                    )}
                  >
                    <img
                      src={preset.image}
                      alt={preset.label}
                      loading="lazy"
                      onLoad={updatePresetScrollState}
                      className="size-full object-cover"
                    />
                  </div>
                  <span
                    className={cn(
                      'w-24 text-center text-[11px] leading-tight transition-colors',
                      isSelected
                        ? 'font-medium text-foreground'
                        : 'text-muted-foreground group-hover:text-foreground'
                    )}
                  >
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
