'use client';

import { Button } from '@/components/ui/button';
import { MediaContextMenu } from '@/components/ui/media-context-menu';
import {
  WatermarkOverlay,
  useVideoDownloadGuard,
} from '@/components/watermark-overlay';
import { useToggleAssetFavorite } from '@/hooks/use-asset-favorites';
import { useDeleteAsset } from '@/hooks/use-assets';
import { useElapsedTime } from '@/hooks/use-elapsed-time';
import { useCurrentPlan } from '@/hooks/use-payment';
import { useSimulatedProgress } from '@/hooks/use-simulated-progress';
import { authClient } from '@/lib/auth-client';
import { cn, downloadImage, generateDownloadFilename } from '@/lib/utils';
import { useImageGenerationStore } from '@/stores/image-generation-store';
import { getVideoModelConfig } from '@/video/config/video-models';

/** Frontend model ID for Wan 2.6 - used as the fallback recommendation */
const WAN26_MODEL_ID = 'wan2-6';
import { useSubscriptionRequiredDialogStore } from '@/stores/subscription-required-dialog-store';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckBig,
  CoinsIcon,
  CornerDownRight,
  Download,
  DownloadIcon,
  Heart,
  Loader2,
  RefreshCw,
  Trash2,
  X,
  XIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ActiveGenerationProps {
  onRegenerate?: () => void;
  onCancel?: () => void;
  onAddToPrompt?: (imageUrl: string) => void;
  onTryWithWan26?: () => void;
}

export function ActiveGeneration({
  onRegenerate,
  onCancel,
  onAddToPrompt,
  onTryWithWan26,
}: ActiveGenerationProps) {
  const { status, activeGeneration, error, reset } = useImageGenerationStore();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isFavorited, setIsFavorited] = useState(false);

  const toggleFavorite = useToggleAssetFavorite();
  const deleteAsset = useDeleteAsset();
  const { guardDownload } = useVideoDownloadGuard();

  // Track when loading started (works for both submitting and polling phases)
  const loadingStartRef = useRef<number | null>(null);
  const isLoading = status === 'submitting' || status === 'polling';
  if (isLoading && !loadingStartRef.current) {
    loadingStartRef.current = Date.now();
  }
  if (!isLoading) {
    loadingStartRef.current = null;
  }

  const elapsedTime = useElapsedTime(
    loadingStartRef.current ?? undefined,
    isLoading
  );

  // Don't render if idle
  if (status === 'idle') {
    return null;
  }

  const isVideo = activeGeneration?.mediaType === 'video';
  const assetId = activeGeneration?.id;

  const handleDownload = (e: React.MouseEvent, url: string, _index: number) => {
    e.stopPropagation();
    const type = isVideo ? 'video' : 'image';
    downloadImage(url, generateDownloadFilename(type, null));
  };

  const handleVideoDownload = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    guardDownload(() =>
      downloadImage(url, generateDownloadFilename('video', null))
    );
  };

  const handleFavorite = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!assetId) return;
      toggleFavorite.mutate(
        { assetId },
        {
          onSuccess: (data) => {
            setIsFavorited(data.favorited);
          },
        }
      );
    },
    [assetId, toggleFavorite]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!assetId) return;
      deleteAsset.mutate(
        { id: assetId },
        {
          onSuccess: () => {
            reset();
          },
        }
      );
    },
    [assetId, deleteAsset, reset]
  );

  const handleImageClick = (index: number) => {
    setPreviewIndex(index);
    setPreviewOpen(true);
  };

  // Get all media URLs for the preview modal
  const mediaUrls = useMemo(() => {
    if (isVideo && activeGeneration?.videoUrl) {
      return [activeGeneration.videoUrl];
    }
    return activeGeneration?.imageUrls ?? [];
  }, [isVideo, activeGeneration?.videoUrl, activeGeneration?.imageUrls]);

  return (
    <>
      <div className="rounded-xl border bg-card p-4 md:p-6 mb-4">
        {/* Header - only show for completed/failed, hidden during loading (progress shown inside animation) */}
        {status !== 'submitting' && status !== 'polling' && (
          <div className="flex items-center mb-4">
            <div className="flex items-center gap-2">
              {status === 'completed' && (
                <>
                  <CheckCircle2 className="size-5 text-green-500" />
                  <span className="font-medium text-green-600">Complete!</span>
                </>
              )}
              {status === 'failed' && (
                <>
                  <AlertCircle className="size-5 text-destructive" />
                  <span className="font-medium text-destructive">Failed</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="space-y-4">
          {/* Loading State */}
          {(status === 'submitting' || status === 'polling') && (
            <div className="space-y-3">
              <GeneratingAnimation
                isVideo={isVideo}
                elapsedTime={elapsedTime}
                progress={activeGeneration?.progress}
                onCancel={onCancel}
              />
              <SubscriptionHint />
            </div>
          )}

          {/* Success State - Show Video */}
          {status === 'completed' && isVideo && activeGeneration?.videoUrl && (
            <div className="space-y-4">
              <div className="max-w-2xl mx-auto">
                <MediaContextMenu
                  onDownload={() =>
                    handleVideoDownload(
                      { stopPropagation: () => {} } as React.MouseEvent,
                      activeGeneration.videoUrl!
                    )
                  }
                  onFavorite={() =>
                    handleFavorite({
                      stopPropagation: () => {},
                    } as React.MouseEvent)
                  }
                  isFavorited={isFavorited}
                >
                  <div className="relative group rounded-lg overflow-hidden bg-muted aspect-video">
                    <video
                      src={activeGeneration.videoUrl}
                      controls
                      controlsList="nodownload"
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-contain"
                    />
                    <WatermarkOverlay />
                    {/* Hover overlay - top portion only, doesn't interfere with video controls */}
                    <div className="absolute top-0 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      {/* Top right: Favorite, Download, Delete */}
                      <div className="pointer-events-auto absolute right-2 top-2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleFavorite}
                          className="flex size-8 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
                        >
                          <Heart
                            className={cn(
                              'size-4',
                              isFavorited && 'fill-current text-red-500'
                            )}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={(e) =>
                            handleVideoDownload(e, activeGeneration.videoUrl!)
                          }
                          className="flex size-8 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
                        >
                          <Download className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={handleDelete}
                          className="flex size-8 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </MediaContextMenu>
              </div>

              {/* Regenerate button - centered */}
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRegenerate}
                  className="gap-2"
                >
                  <RefreshCw className="size-4" />
                  Regenerate
                </Button>
              </div>
            </div>
          )}

          {/* Success State - Show Images */}
          {status === 'completed' &&
            !isVideo &&
            activeGeneration?.imageUrls &&
            activeGeneration.imageUrls.length > 0 && (
              <div
                className={cn(
                  'mx-auto space-y-4',
                  activeGeneration.imageUrls.length === 1
                    ? 'max-w-md'
                    : 'max-w-4xl'
                )}
              >
                <div
                  className={cn(
                    'grid gap-4',
                    activeGeneration.imageUrls.length === 1
                      ? 'grid-cols-1'
                      : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                  )}
                >
                  {activeGeneration.imageUrls.map((url, index) => (
                    <MediaContextMenu
                      key={`ctx-${url}-${index}`}
                      onDownload={() =>
                        handleDownload(
                          { stopPropagation: () => {} } as React.MouseEvent,
                          url,
                          index
                        )
                      }
                      onFavorite={() =>
                        handleFavorite({
                          stopPropagation: () => {},
                        } as React.MouseEvent)
                      }
                      isFavorited={isFavorited}
                    >
                      <div
                        className={cn(
                          'relative group rounded-lg overflow-hidden bg-muted cursor-pointer',
                          !activeGeneration.aspectRatio && 'aspect-square',
                          activeGeneration.imageUrls!.length > 1 && 'max-w-xs'
                        )}
                        style={
                          activeGeneration.aspectRatio
                            ? {
                                aspectRatio:
                                  activeGeneration.aspectRatio.replace(
                                    ':',
                                    '/'
                                  ),
                              }
                            : undefined
                        }
                        onClick={() => handleImageClick(index)}
                      >
                        <Image
                          src={url}
                          alt={`Generated image ${index + 1}`}
                          fill
                          className="object-contain transition-transform duration-300 group-hover:scale-105"
                          unoptimized
                        />
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Top left: Add To Prompt */}
                          {onAddToPrompt && (
                            <div className="absolute left-2 top-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddToPrompt(url);
                                }}
                                className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-sm font-medium text-gray-800 backdrop-blur-md transition-colors hover:bg-white/95"
                              >
                                <CornerDownRight className="size-3.5" />
                                Add To Prompt
                              </button>
                            </div>
                          )}
                          {/* Top right: Favorite, Download, Delete */}
                          <div className="absolute right-2 top-2 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={handleFavorite}
                              className="flex size-8 items-center justify-center rounded-full bg-white/80 text-gray-700 backdrop-blur-md transition-colors hover:bg-white/95"
                            >
                              <Heart
                                className={cn(
                                  'size-4',
                                  isFavorited && 'fill-current text-red-500'
                                )}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDownload(e, url, index)}
                              className="flex size-8 items-center justify-center rounded-full bg-white/80 text-gray-700 backdrop-blur-md transition-colors hover:bg-white/95"
                            >
                              <Download className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={handleDelete}
                              className="flex size-8 items-center justify-center rounded-full bg-white/80 text-gray-700 backdrop-blur-md transition-colors hover:bg-white/95"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </MediaContextMenu>
                  ))}
                </div>

                {/* Regenerate button - centered within same container as images */}
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRegenerate}
                    className="gap-2"
                  >
                    <RefreshCw className="size-4" />
                    Regenerate
                  </Button>
                </div>
              </div>
            )}

          {/* Error State */}
          {status === 'failed' && (
            <FailedState
              error={error}
              errorMessage={activeGeneration?.errorMessage}
              isVideo={isVideo}
              modelId={activeGeneration?.modelId}
              onRegenerate={onRegenerate}
              onTryWithWan26={onTryWithWan26}
            />
          )}
        </div>
      </div>

      {/* Preview Modal - Click to expand image/video */}
      {previewOpen && mediaUrls.length > 0 && (
        <MediaPreviewModal
          urls={mediaUrls}
          currentIndex={previewIndex}
          isVideo={!!isVideo}
          onClose={() => setPreviewOpen(false)}
          onIndexChange={setPreviewIndex}
          onDownload={(url) => {
            const type = isVideo ? 'video' : 'image';
            if (isVideo) {
              guardDownload(() =>
                downloadImage(url, generateDownloadFilename(type, null))
              );
            } else {
              downloadImage(url, generateDownloadFilename(type, null));
            }
          }}
        />
      )}
    </>
  );
}

/** Error state with optional Wan 2.6 fallback recommendation */
function FailedState({
  error,
  errorMessage,
  isVideo,
  modelId,
  onRegenerate,
  onTryWithWan26,
}: {
  error: string | null;
  errorMessage?: string;
  isVideo: boolean;
  modelId?: string;
  onRegenerate?: () => void;
  onTryWithWan26?: () => void;
}) {
  const t = useTranslations('AIWorkspace');

  // Show Wan 2.6 fallback only for video failures with a non-Wan-2.6 model
  const showWan26Fallback =
    isVideo && modelId && modelId !== WAN26_MODEL_ID && !!onTryWithWan26;

  // Get Wan 2.6 credits for display
  const wan26Credits = useMemo(() => {
    if (!showWan26Fallback) return null;
    const config = getVideoModelConfig(WAN26_MODEL_ID);
    if (!config) return null;
    const pricing = config.perSecondCredits;
    if (typeof pricing === 'number') return String(pricing);
    const prices = Object.values(pricing).filter(
      (p): p is number => p !== undefined
    );
    if (prices.length === 0) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? String(min) : `${min}-${max}`;
  }, [showWan26Fallback]);

  return (
    <div className="flex flex-col items-center justify-center py-8 gap-4">
      <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertCircle className="size-8 text-destructive" />
      </div>
      <div className="text-center">
        <p className="font-medium text-destructive">{t('generationFailed')}</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          {error || errorMessage || t('unexpectedError')}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRegenerate}
        className="gap-2"
      >
        <RefreshCw className="size-4" />
        {t('tryAgain')}
      </Button>

      {showWan26Fallback && (
        <>
          <span className="text-xs text-muted-foreground">
            {t('failedFallbackOr')}
          </span>
          <button
            type="button"
            onClick={onTryWithWan26}
            className="group w-full max-w-sm rounded-xl border border-border/60 bg-card/80 p-4 text-left transition-all hover:border-blue-500/50 hover:bg-blue-500/5"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-sm font-medium">
                  Wan 2.6{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    — {t('failedFallbackDescription')}
                  </span>
                </span>
                {wan26Credits && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CoinsIcon className="size-3" />
                    {wan26Credits}/s · {t('failedFallbackCredits')}
                  </div>
                )}
              </div>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>
        </>
      )}
    </div>
  );
}

/** Animated loading card shown during generation */
function GeneratingAnimation({
  isVideo,
  elapsedTime,
  progress,
  onCancel,
}: {
  isVideo: boolean;
  elapsedTime: number;
  progress: number | undefined;
  onCancel?: () => void;
}) {
  const t = useTranslations('AIWorkspace');
  const displayProgress = useSimulatedProgress(elapsedTime, progress, isVideo);

  // Show hint after 2 min for video, 1 min for images
  const showLongWaitHint = elapsedTime >= (isVideo ? 120 : 60);

  return (
    <div className="relative w-full aspect-video max-w-2xl mx-auto rounded-xl overflow-hidden bg-black">
      {/* Background loading video */}
      <video
        src="https://assets.movart.ai/landingpage/loading.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Semi-transparent overlay for better text readability */}
      <div className="absolute inset-0 bg-black/10" />

      {/* Progress indicator - top left */}
      <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-1.5">
        <span className="text-white text-sm font-semibold drop-shadow-lg bg-black/30 backdrop-blur-sm rounded-md px-2.5 py-1">
          {`${displayProgress}% ${isVideo ? 'Generating video' : 'Generating'}...`}
        </span>
        <RotatingTip />
      </div>

      {/* Long wait hint - top right */}
      {showLongWaitHint && (
        <div className="absolute top-3 right-3 z-10 max-w-[220px]">
          <span className="text-white/90 text-xs drop-shadow-lg bg-black/40 backdrop-blur-sm rounded-md px-2.5 py-1.5 block leading-relaxed">
            {t('longWaitHint')}
          </span>
        </div>
      )}

      {/* Nyancat animation - bottom center */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/nyancat.svg"
          alt="Loading animation"
          width={120}
          height={72}
          className="drop-shadow-lg"
        />
      </div>

      {/* Cancel button - bottom right */}
      {onCancel && (
        <div className="absolute bottom-3 right-3 z-10">
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
            className="gap-1.5 bg-black/40 hover:bg-black/60 text-white border-0 backdrop-blur-sm"
          >
            <X className="size-3.5" />
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

/** Keys into AIWorkspace.loadingTips, rotated in order during generation. */
const LOADING_TIP_KEYS = [
  'warmup',
  'tipStyle',
  'sketch',
  'tipAspect',
  'refine',
  'tipLighting',
  'color',
  'finalize',
] as const;

/** Rotates a short hint under the progress badge to make the wait feel alive. */
function RotatingTip() {
  const t = useTranslations('AIWorkspace');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % LOADING_TIP_KEYS.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  const tipKey = LOADING_TIP_KEYS[index];

  return (
    <span
      key={tipKey}
      className="text-white/90 text-xs drop-shadow-lg bg-black/30 backdrop-blur-sm rounded-md px-2.5 py-1 animate-in fade-in duration-500 max-w-[260px]"
    >
      {t(`loadingTips.${tipKey}`)}
    </span>
  );
}

/** Full-screen preview modal for generated images/videos */
function MediaPreviewModal({
  urls,
  currentIndex,
  isVideo,
  onClose,
  onIndexChange,
  onDownload,
}: {
  urls: string[];
  currentIndex: number;
  isVideo: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  onDownload: (url: string, index: number) => void;
}) {
  const url = urls[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < urls.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev) onIndexChange(currentIndex - 1);
  }, [hasPrev, currentIndex, onIndexChange]);

  const handleNext = useCallback(() => {
    if (hasNext) onIndexChange(currentIndex + 1);
  }, [hasNext, currentIndex, onIndexChange]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          handlePrev();
          break;
        case 'ArrowRight':
          handleNext();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handlePrev, handleNext]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xl"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-4 top-4 z-20 flex size-10 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
      >
        <XIcon className="size-5" />
      </button>

      {/* Left arrow */}
      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handlePrev();
          }}
          className="absolute left-4 top-1/2 z-20 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white sm:left-6"
        >
          <ChevronLeftIcon className="size-6" />
        </button>
      )}

      {/* Right arrow */}
      {hasNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
          className="absolute right-4 top-1/2 z-20 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white sm:right-6"
        >
          <ChevronRightIcon className="size-6" />
        </button>
      )}

      {/* Media container */}
      <MediaContextMenu onDownload={() => onDownload(url, currentIndex)}>
        <div
          className="relative max-h-full max-w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Download button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDownload(url, currentIndex);
            }}
            className="absolute right-2 top-2 z-20 flex size-9 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
          >
            <DownloadIcon className="size-4" />
          </button>

          {/* Media content */}
          {isVideo ? (
            <video
              src={url}
              controls
              controlsList="nodownload"
              autoPlay
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            >
              <track kind="captions" />
            </video>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt="Generated preview"
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            />
          )}
        </div>
      </MediaContextMenu>
    </div>
  );
}

/** Subscription status hint shown below the loading animation */
function SubscriptionHint() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { data: paymentData, isLoading } = useCurrentPlan(session?.user?.id);
  const { openDialog } = useSubscriptionRequiredDialogStore();

  const isSubscribed =
    !isLoading && paymentData?.currentPlan && !paymentData.currentPlan.isFree;

  // Don't show anything while session or payment data is still loading
  if (sessionPending || isLoading || !session?.user?.id) return null;

  if (isSubscribed) {
    return (
      <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
        <CircleCheckBig className="size-4 text-green-500" />
        <span>Pro acceleration active</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
      <span className="text-sm">⚡</span>
      <span>Want faster generation?</span>
      <button
        type="button"
        onClick={() => openDialog('generation_acceleration')}
        className="text-primary hover:underline font-medium"
      >
        Subscribe to accelerate
      </button>
    </div>
  );
}
