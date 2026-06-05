'use client';

import { downloadImage, generateDownloadFilename } from '@/lib/utils';
import { AlertTriangle, Download, RefreshCw, Video } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const HOME_LOADING_VIDEO_URL =
  'https://assets.gemini-omni.video/landingpage/loading.mp4';
const HOME_LOADING_VIDEO_POSTER_URL = '/landingpage/loading-poster.jpg';
const HOME_IDLE_VIDEO_URL = '/landingpage/gemini-omni-reference-woman.mp4';
const HOME_IDLE_VIDEO_POSTER_URL =
  '/landingpage/gemini-omni-reference-woman-poster.jpg';

export type PreviewState = 'idle' | 'generating' | 'done' | 'failed';

interface PreviewPanelProps {
  previewState: PreviewState;
  progress: number;
  resultVideoUrl?: string | null;
  errorMessage?: string | null;
  onRetry?: () => void;
}

export default function PreviewPanel({
  previewState,
  progress,
  resultVideoUrl,
  errorMessage,
  onRetry,
}: PreviewPanelProps) {
  const t = useTranslations('HomePage.videoHero');
  const tCommon = useTranslations('Common.contextMenu');
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = () => {
    if (!resultVideoUrl || isDownloading) return;

    setIsDownloading(true);
    void downloadImage(resultVideoUrl, generateDownloadFilename('video', null))
      .catch((error) => {
        console.error('Failed to download generated video:', error);
      })
      .finally(() => {
        setIsDownloading(false);
      });
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-xl border bg-card p-3 shadow-lg sm:rounded-2xl sm:p-5">
      {/* panel header */}
      <div className="mb-4 flex items-center gap-2">
        <Video className="size-5 text-foreground" />
        <span className="text-base font-semibold text-foreground">
          {t('preview.title')}
        </span>
      </div>

      <div
        className="relative w-full overflow-hidden rounded-xl bg-muted"
        style={{ aspectRatio: '16/9' }}
      >
        {previewState === 'idle' && (
          <span className="absolute left-3 top-3 z-10 rounded-md bg-black/40 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {t('preview.example')}
          </span>
        )}
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
            </motion.div>
          )}

          {/* result state */}
          {previewState === 'done' && resultVideoUrl && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              {/* biome-ignore lint/a11y/useMediaCaption: Generated clips do not have transcript tracks available. */}
              <video
                src={resultVideoUrl}
                autoPlay
                loop
                controls
                controlsList="nodownload"
                playsInline
                className="h-full w-full object-contain"
              />
            </motion.div>
          )}

          {/* failed state */}
          {previewState === 'failed' && (
            <motion.div
              key="failed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 sm:gap-4 sm:p-6"
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
              className="absolute inset-0 flex items-center justify-center"
            >
              {/* Blurred backdrop fills the 16:9 frame for portrait clips */}
              <video
                src={HOME_IDLE_VIDEO_URL}
                poster={HOME_IDLE_VIDEO_POSTER_URL}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
              />
              {/* Sharp, uncropped video centered on top */}
              <video
                src={HOME_IDLE_VIDEO_URL}
                poster={HOME_IDLE_VIDEO_POSTER_URL}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                className="relative h-full w-full object-contain"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="pt-3 text-center text-sm text-muted-foreground">
        {t('preview.caption')}
      </p>

      {previewState === 'done' && resultVideoUrl && (
        <div className="pt-3">
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="size-4" />
            {tCommon('download')}
          </button>
        </div>
      )}
    </div>
  );
}
