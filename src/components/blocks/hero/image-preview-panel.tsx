'use client';

import { LoginWrapper } from '@/components/auth/login-wrapper';
import { MediaPreviewModal } from '@/components/ui/media-preview-modal';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { websiteConfig } from '@/config/website';
import { useCurrentPlan } from '@/hooks/use-payment';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { downloadImage, generateDownloadFilename } from '@/lib/utils';
import type { HomeRecentGeneration } from '@/stores/home-image-store';
import { useHomeImageStore } from '@/stores/home-image-store';
import {
  AlertTriangle,
  BadgeCheck,
  Download,
  History,
  Image as ImageIcon,
  LogIn,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { HomeRecentGenerations } from './home-recent-generations';
import { SCENE_PRESETS, STYLE_PRESETS, TEMPLATE_COUNT } from './image-presets';

const HOME_LOADING_VIDEO_URL =
  'https://assets.gemini-omni.video/landingpage/loading.mp4';
const HOME_LOADING_VIDEO_POSTER_URL =
  'https://assets.gemini-omni.video/landingpage/loading-poster.webp';

// Idle-state Before/After examples (whisk-style preview): a real before/after
// edit pair shown in the image-generation result area.
const BEFORE_EXAMPLE_URL =
  'https://assets.gemini-omni.video/gptimage/landingpage/nano-banana-before-edit.png';
const AFTER_EXAMPLE_URL =
  'https://assets.gemini-omni.video/gptimage/landingpage/nano-banana-after-edit.png';

let warmLoadingVideoPromise: Promise<void> | null = null;

function warmHomeLoadingVideo() {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (warmLoadingVideoPromise) {
    return warmLoadingVideoPromise;
  }

  warmLoadingVideoPromise = new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = HOME_LOADING_VIDEO_URL;

    const cleanup = () => {
      video.onloadeddata = null;
      video.oncanplay = null;
      video.onerror = null;
    };

    video.onloadeddata = () => {
      cleanup();
      resolve();
    };
    video.oncanplay = () => {
      cleanup();
      resolve();
    };
    video.onerror = () => {
      cleanup();
      resolve();
    };

    video.load();
  });

  return warmLoadingVideoPromise;
}

export type ImagePreviewState = 'idle' | 'generating' | 'done' | 'failed';

interface ImagePreviewPanelProps {
  previewState: ImagePreviewState;
  progress: number;
  resultImageUrl?: string | null;
  errorMessage?: string | null;
  onRetry?: () => void;
  onCancel?: () => void;
  onUpgradeClick?: () => void;
  recentGenerations: HomeRecentGeneration[];
  isRecentLoading: boolean;
  selectedRecentId: string | null;
  onSelectRecent: (generation: HomeRecentGeneration) => void;
}

export default function ImagePreviewPanel({
  previewState,
  progress,
  resultImageUrl,
  errorMessage,
  onRetry,
  onCancel,
  onUpgradeClick,
  recentGenerations,
  isRecentLoading,
  selectedRecentId,
  onSelectRecent,
}: ImagePreviewPanelProps) {
  const t = useTranslations('HomePage.imageHero');
  const [isDownloading, setIsDownloading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateTab, setTemplateTab] = useState<'styles' | 'scenes'>('styles');
  const applyTemplate = useHomeImageStore((s) => s.applyTemplate);
  const { data: session } = authClient.useSession();
  const isLoggedIn = !!session?.user;
  const { data: paymentData } = useCurrentPlan(session?.user?.id);
  const hasEverPaid = paymentData?.currentPlan
    ? !paymentData.currentPlan.isFree
    : false;
  const showUpgradeCta =
    websiteConfig.features.enableWatermark && !hasEverPaid && !!onUpgradeClick;

  useEffect(() => {
    void warmHomeLoadingVideo();
  }, []);

  const handleDownload = async () => {
    if (!resultImageUrl || isDownloading) return;

    try {
      setIsDownloading(true);
      await downloadImage(
        resultImageUrl,
        generateDownloadFilename('image', null)
      );
    } catch (error) {
      console.error('Failed to download generated image:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-xl border bg-card p-3 shadow-lg sm:rounded-2xl sm:p-5">
      {/* panel header: title + history */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="size-5 text-foreground" />
          <span className="text-base font-semibold text-foreground">
            {t('preview.title')}
          </span>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('preview.history')}
              className="inline-flex size-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <History className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="max-h-[70vh] w-[min(calc(100vw-1.5rem),360px)] overflow-y-auto p-3"
          >
            <HomeRecentGenerations
              items={recentGenerations}
              loading={isRecentLoading}
              selectedId={selectedRecentId}
              onSelect={onSelectRecent}
            />
          </PopoverContent>
        </Popover>
      </div>

      {previewState === 'idle' && showTemplates ? (
        /* template gallery: whisk-style "Pick a template to start" grid */
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-foreground">
                {t('preview.pickTemplate')}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t('preview.pickTemplateHint')}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row sm:items-center">
              <div className="grid grid-cols-2 rounded-lg bg-muted/60 p-1 sm:inline-flex sm:items-center">
                {(['styles', 'scenes'] as const).map((tabId) => (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => setTemplateTab(tabId)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                      templateTab === tabId
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tabId === 'scenes' ? t('scenesTitle') : t('styles.title')}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowTemplates(false)}
                className="inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
                {t('preview.closeTemplates')}
              </button>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4 sm:gap-3 [scrollbar-width:thin]">
            {(templateTab === 'scenes' ? SCENE_PRESETS : STYLE_PRESETS).map(
              (preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    applyTemplate(preset.id, preset.prompt);
                    setShowTemplates(false);
                  }}
                  className="group relative flex flex-col overflow-hidden rounded-xl bg-muted text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <span className="absolute left-2 top-2 z-10 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                    {templateTab === 'scenes' ? 'Scene' : 'Style'}
                  </span>
                  <img
                    src={preset.image}
                    alt={preset.label}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2.5">
                    <div className="truncate text-sm font-semibold text-white">
                      {preset.label}
                    </div>
                    <div className="line-clamp-2 text-[11px] leading-tight text-white/70">
                      {preset.description}
                    </div>
                  </div>
                </button>
              )
            )}
          </div>
        </div>
      ) : previewState === 'idle' ? (
        /* idle: Browse templates + Before/After examples + upload hint */
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowTemplates(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#6359a6] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#564d8c]"
            >
              <Sparkles className="size-3.5" />
              {t('preview.browseTemplates', { count: TEMPLATE_COUNT })}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <figure className="relative overflow-hidden rounded-xl bg-muted">
              <span className="absolute left-2 top-2 z-10 rounded-md bg-black/40 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                {t('preview.beforeExample')}
              </span>
              <img
                src={BEFORE_EXAMPLE_URL}
                alt={t('preview.beforeExample')}
                className="aspect-square w-full object-cover"
              />
            </figure>
            <figure className="relative overflow-hidden rounded-xl bg-muted">
              <span className="absolute left-2 top-2 z-10 rounded-md bg-black/40 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                {t('preview.afterExample')}
              </span>
              <img
                src={AFTER_EXAMPLE_URL}
                alt={t('preview.afterExample')}
                className="aspect-square w-full object-cover"
              />
            </figure>
          </div>

          <p className="pt-1 text-center text-sm text-muted-foreground">
            {t('preview.clickToUpload')}
          </p>
        </div>
      ) : (
        <div
          className="relative w-full overflow-hidden rounded-xl bg-muted"
          style={{ aspectRatio: '1/1' }}
        >
          {/* generating state */}
          {previewState === 'generating' && (
            <div className="absolute inset-0 bg-black animate-in fade-in-0 duration-300">
              {/* Background loading video */}
              <video
                src={HOME_LOADING_VIDEO_URL}
                poster={HOME_LOADING_VIDEO_POSTER_URL}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="absolute inset-0 w-full h-full object-cover"
              />

              {/* Semi-transparent overlay */}
              <div className="absolute inset-0 bg-black/10" />

              {/* Progress indicator — top left */}
              <div className="absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)] sm:left-3 sm:top-3">
                <span className="block truncate rounded-md bg-black/30 px-2 py-1 text-xs font-semibold text-white drop-shadow-lg backdrop-blur-sm sm:px-2.5 sm:text-sm">
                  {progress}% {t('generatingHint')}
                </span>
              </div>

              {/* Nyancat animation — bottom center */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
                <img
                  src="/nyancat.svg"
                  alt="Loading animation"
                  width={90}
                  height={54}
                  className="drop-shadow-lg sm:h-[60px] sm:w-[100px]"
                />
              </div>

              {onCancel && (
                <div className="absolute bottom-2 right-2 z-10 sm:bottom-3 sm:right-3">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex items-center gap-1.5 rounded-md bg-black/40 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/60 sm:px-3 sm:py-2 sm:text-sm"
                  >
                    <X className="size-4" />
                    {t('preview.cancel')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* result state */}
          {previewState === 'done' && resultImageUrl && (
            <div className="absolute inset-0 animate-in fade-in-0 zoom-in-95 duration-300">
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="h-full w-full cursor-zoom-in"
              >
                <img
                  src={resultImageUrl}
                  alt="Generated result"
                  className="h-full w-full object-contain select-none"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                />
              </button>
            </div>
          )}

          {/* failed state */}
          {previewState === 'failed' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 animate-in fade-in-0 duration-300 sm:gap-4 sm:p-6">
              <div className="flex size-14 items-center justify-center rounded-full bg-red-500/10">
                <AlertTriangle className="size-7 text-red-500" />
              </div>
              <p className="text-sm text-center text-muted-foreground">
                {errorMessage || 'Generation failed'}
              </p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
                >
                  <RefreshCw className="size-4" />
                  Try Again
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {previewState === 'done' && resultImageUrl && (
        <>
          <div className="space-y-2 pt-3">
            {showUpgradeCta && (
              <button
                type="button"
                onClick={onUpgradeClick}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#6359a6] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#6359a6]/20 transition-colors hover:bg-[#544a96]"
              >
                <BadgeCheck className="size-4" />
                {t('preview.removeWatermark')}
              </button>
            )}
            {isLoggedIn ? (
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="size-4" />
                {isDownloading
                  ? t('preview.downloading')
                  : t('preview.download')}
              </button>
            ) : (
              <LoginWrapper mode="modal" asChild>
                <button
                  type="button"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
                >
                  <LogIn className="size-4" />
                  {t('preview.loginToDownload')}
                </button>
              </LoginWrapper>
            )}
          </div>

          <MediaPreviewModal
            items={[
              {
                alt: 'Generated result',
                onDownload: isLoggedIn
                  ? () => {
                      void handleDownload();
                    }
                  : undefined,
                type: 'image',
                url: resultImageUrl,
              },
            ]}
            currentIndex={0}
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            onIndexChange={() => {}}
          />
        </>
      )}
    </div>
  );
}
