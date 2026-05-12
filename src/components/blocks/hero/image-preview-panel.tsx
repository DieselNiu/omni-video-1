'use client';

import { LoginWrapper } from '@/components/auth/login-wrapper';
import { MediaPreviewModal } from '@/components/ui/media-preview-modal';
import { websiteConfig } from '@/config/website';
import { useCurrentPlan } from '@/hooks/use-payment';
import { authClient } from '@/lib/auth-client';
import { downloadImage, generateDownloadFilename } from '@/lib/utils';
import {
  AlertTriangle,
  Download,
  LogIn,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const HOME_LOADING_VIDEO_URL =
  'https://assets.gemini-omni.video/landingpage/loading.mp4';

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
}

export default function ImagePreviewPanel({
  previewState,
  progress,
  resultImageUrl,
  errorMessage,
  onRetry,
  onCancel,
  onUpgradeClick,
}: ImagePreviewPanelProps) {
  const t = useTranslations('HomePage.imageHero');
  const [isDownloading, setIsDownloading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
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
    <div className="flex-1 flex flex-col rounded-xl bg-muted/30 border p-3">
      <div
        className="relative w-full overflow-hidden rounded-xl bg-muted"
        style={{ aspectRatio: '1/1' }}
      >
        <AnimatePresence mode="wait">
          {/* generating state */}
          {previewState === 'generating' && (
            <motion.div
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black"
            >
              {/* Background loading video */}
              <video
                src={HOME_LOADING_VIDEO_URL}
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
              <div className="absolute top-3 left-3 z-10">
                <span className="text-white text-sm font-semibold drop-shadow-lg bg-black/30 backdrop-blur-sm rounded-md px-2.5 py-1">
                  {progress}% {t('generatingHint')}
                </span>
              </div>

              {/* Nyancat animation — bottom center */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
                <img
                  src="/nyancat.svg"
                  alt="Loading animation"
                  width={100}
                  height={60}
                  className="drop-shadow-lg"
                />
              </div>

              {onCancel && (
                <div className="absolute bottom-3 right-3 z-10">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex items-center gap-1.5 rounded-md bg-black/40 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/60"
                  >
                    <X className="size-4" />
                    {t('preview.cancel')}
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* result state */}
          {previewState === 'done' && resultImageUrl && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
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
            </motion.div>
          )}

          {/* failed state */}
          {previewState === 'failed' && (
            <motion.div
              key="failed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6"
            >
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
            </motion.div>
          )}

          {/* idle / default preview */}
          {previewState === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              <img
                src="https://assets.gemini-omni.video/gptimage/landingpage/gpt-image-2-example-03.jpeg"
                alt="Preview"
                className="h-full w-full object-contain"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {previewState === 'done' && resultImageUrl && (
        <>
          <div className="space-y-2 pt-3">
            {showUpgradeCta && (
              <button
                type="button"
                onClick={onUpgradeClick}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-opacity hover:opacity-95"
              >
                <Sparkles className="size-4" />
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
