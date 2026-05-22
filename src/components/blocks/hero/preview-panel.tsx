'use client';

import { LoginWrapper } from '@/components/auth/login-wrapper';
import { MediaPreviewModal } from '@/components/ui/media-preview-modal';
import { downloadImage, generateDownloadFilename } from '@/lib/utils';
import { AlertTriangle, Download, LogIn, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export type PreviewState = 'idle' | 'generating' | 'done' | 'failed';

interface PreviewPanelProps {
  previewState: PreviewState;
  progress: number;
  resultVideoUrl?: string | null;
  resultImageUrl?: string | null;
  errorMessage?: string | null;
  onRetry?: () => void;
  prompt?: string | null;
  isLoggedIn?: boolean;
}

export default function PreviewPanel({
  previewState,
  progress,
  resultVideoUrl,
  resultImageUrl,
  errorMessage,
  onRetry,
  prompt,
  isLoggedIn = false,
}: PreviewPanelProps) {
  const t = useTranslations('HomePage.videoHero');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const isVideoResult = !resultImageUrl && !!resultVideoUrl;
  const resultUrl = resultImageUrl || resultVideoUrl || null;
  const mediaType: 'image' | 'video' = isVideoResult ? 'video' : 'image';

  const handleDownload = async () => {
    if (!resultUrl || isDownloading) return;
    try {
      setIsDownloading(true);
      await downloadImage(
        resultUrl,
        generateDownloadFilename(mediaType, prompt ?? null)
      );
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col rounded-xl bg-muted/30 border p-3">
      <div
        className="relative w-full overflow-hidden rounded-xl bg-muted"
        style={{ aspectRatio: '16/9' }}
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
                src="https://assets.gemini-omni.video/landingpage/loading.mp4"
                poster="https://assets.gemini-omni.video/landingpage/loading.jpg"
                autoPlay
                loop
                muted
                playsInline
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
            </motion.div>
          )}

          {/* result state */}
          {previewState === 'done' && resultUrl && (
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
                aria-label="Open preview"
              >
                {isVideoResult ? (
                  <video
                    src={resultVideoUrl!}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-full w-full object-contain pointer-events-none"
                  />
                ) : (
                  <img
                    src={resultImageUrl!}
                    alt="Generated result"
                    className="h-full w-full object-contain select-none"
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                )}
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
                {errorMessage || 'Video generation failed'}
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
              <video
                src="https://assets.gemini-omni.video/landing-hero.mp4"
                poster="https://assets.gemini-omni.video/landing-hero.jpg"
                autoPlay
                loop
                muted
                playsInline
                className="h-full w-full object-contain"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {previewState === 'done' && resultUrl && (
        <>
          <div className="space-y-2 pt-3">
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
                type: mediaType,
                url: resultUrl,
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
