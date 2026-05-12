'use client';

import { useCaptchaGatedUpload } from '@/hooks/use-captcha-gated-upload';
import { useCreditBalance } from '@/hooks/use-credits';
import { useToast } from '@/hooks/use-toast';
import {
  IMAGE_MODELS,
  calculateImageCredits,
  getHomeImageModelOption,
  isProModel,
} from '@/image/config/image-models';
import { cn } from '@/lib/utils';
import type { HomeQuotaState } from '@/stores/home-image-store';
import {
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Monitor,
  MonitorSmartphone,
  Sparkles,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useCallback, useRef, useState } from 'react';

const tabs = [
  { id: 'image-to-image', icon: ImageIcon },
  { id: 'text-to-image', icon: Type },
] as const;

type TabId = (typeof tabs)[number]['id'];

function AspectRatioIcon({ ratio }: { ratio: string }) {
  const sizes: Record<string, { w: number; h: number }> = {
    '1:1': { w: 20, h: 20 },
    '16:9': { w: 28, h: 16 },
    '9:16': { w: 14, h: 24 },
    '4:3': { w: 24, h: 18 },
    '3:4': { w: 16, h: 22 },
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

interface ImageOperationPanelProps {
  isGenerating: boolean;
  quota: HomeQuotaState | null;
  isQuotaLoading: boolean;
  onCooldownClick: () => void;
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
  isQuotaLoading,
  onCooldownClick,
  onGenerate,
}: ImageOperationPanelProps) {
  const t = useTranslations('HomePage.imageHero');
  const { toast } = useToast();
  const { data: userCredits = 0 } = useCreditBalance();

  // Homepage hero exposes a single model — the home-anonymous surface
  // default. Read it from the same surface config the submit route
  // gates on, so the picker can never offer something the surface
  // would later reject. The picker UI still renders the option chip
  // for visual continuity but there's nothing else to choose from.
  const homeModelOption = getHomeImageModelOption();
  const [activeTab, setActiveTab] = useState<TabId>('image-to-image');
  const [selectedModel, setSelectedModel] = useState(homeModelOption.value);
  const [resolution, setResolution] = useState<string>('1K');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [prompt, setPrompt] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const { uploadWithCaptcha, captchaDialog } = useCaptchaGatedUpload();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const modelOptions = [homeModelOption];
  const currentModel = IMAGE_MODELS[selectedModel];
  const supportedAspectRatios = currentModel?.supportedAspectRatios || ['1:1'];
  const supportedResolutions = currentModel?.supportedResolutions || [];
  const showResolution = isProModel(selectedModel);

  const creditsCost = calculateImageCredits(
    selectedModel,
    showResolution ? resolution : undefined
  );
  const availableCredits = quota?.currentCredits ?? userCredits;

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

    onGenerate({
      modelId: selectedModel,
      prompt: prompt.trim(),
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

  const selectedModelOption = modelOptions.find(
    (model) => model.value === selectedModel
  );

  return (
    <div className="w-full lg:w-[480px] shrink-0 space-y-5">
      {captchaDialog}
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

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Layers className="size-4" />
          {t('aiModel')}
        </div>
        <div className="flex w-full items-center justify-between rounded-xl bg-muted/60 p-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-transparent text-xl">
              {selectedModelOption?.logo ? (
                <Image
                  src={selectedModelOption.logo}
                  alt="OpenAI"
                  width={18}
                  height={18}
                  className="size-[18px]"
                />
              ) : (
                <span>{selectedModelOption?.icon || '◌'}</span>
              )}
            </div>
            <div className="text-left">
              <span className="text-sm font-semibold text-foreground">
                {selectedModelOption?.label || 'GPT Image 2'}
              </span>
              <p className="text-xs text-muted-foreground">
                {creditsCost} {t('credits')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {activeTab === 'image-to-image' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ImageIcon className="size-4" />
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
                  <img
                    src={image.previewUrl}
                    alt="Upload"
                    className="size-full object-cover"
                  />
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
                      onClick={() => removeImage(image.id)}
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
                onClick={() => fileInputRef.current?.click()}
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
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="size-4" />
          {t('prompt')}
        </div>
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
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

      {showResolution && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Monitor className="size-4" />
            {t('resolution')}
          </div>
          <div className="inline-flex gap-1 rounded-xl bg-muted/60 p-1">
            {supportedResolutions.map((supportedResolution) => (
              <button
                key={supportedResolution}
                type="button"
                onClick={() => setResolution(supportedResolution)}
                className={cn(
                  'rounded-lg px-4 py-1.5 text-sm font-medium transition-all',
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
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <MonitorSmartphone className="size-4" />
          {t('aspectRatio')}
        </div>
        <div className="grid grid-cols-6 gap-2">
          {supportedAspectRatios.map((supportedAspectRatio) => (
            <button
              key={supportedAspectRatio}
              type="button"
              onClick={() => setAspectRatio(supportedAspectRatio)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl p-3 transition-all',
                aspectRatio === supportedAspectRatio
                  ? 'bg-background border border-foreground/20 text-foreground shadow-sm'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent'
              )}
            >
              <AspectRatioIcon ratio={supportedAspectRatio} />
              <span className="text-[11px]">{supportedAspectRatio}</span>
            </button>
          ))}
        </div>
      </div>

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

      <div className="flex items-center justify-center gap-1 text-center text-sm text-muted-foreground">
        {isQuotaLoading ? (
          <span>{t('quota.loading')}</span>
        ) : quota?.accessMode === 'guest_quota' ? (
          <span>
            {t('quota.anonRemaining', {
              count: quota.remaining,
              total: quota.capacity,
            })}
          </span>
        ) : quota?.accessMode === 'login_required' ? (
          <span>{t('quota.loginRequiredCta')}</span>
        ) : quota?.accessMode === 'free_quota' ? (
          <span>
            {quota.exhausted ? (
              <button
                type="button"
                onClick={onCooldownClick}
                className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-blue-600"
              >
                {t('quota.cooldownCta')}
              </button>
            ) : (
              t('quota.userRemaining', {
                count: quota.remaining,
                total: quota.capacity,
              })
            )}
          </span>
        ) : (
          <>
            <span>{t('cost')}</span>
            <span className="font-semibold text-foreground">{creditsCost}</span>
            <span>{t('credits')}</span>
            <span className="mx-1">|</span>
            <span>{t('available')}</span>
            <span className="font-semibold text-foreground">
              {availableCredits}
            </span>
            <span>{t('credits')}</span>
          </>
        )}
      </div>
    </div>
  );
}
