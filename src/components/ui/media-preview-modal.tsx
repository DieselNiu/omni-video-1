'use client';

import { MediaContextMenu } from '@/components/ui/media-context-menu';
import { WatermarkOverlay } from '@/components/watermark-overlay';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect } from 'react';

export interface MediaPreviewItem {
  alt?: string;
  onDownload?: () => void;
  type: 'image' | 'video';
  url: string;
}

interface MediaPreviewModalProps {
  items: MediaPreviewItem[];
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}

export function MediaPreviewModal({
  items,
  currentIndex,
  open,
  onOpenChange,
  onIndexChange,
}: MediaPreviewModalProps) {
  const item = items[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handlePrev = useCallback(() => {
    if (hasPrev) {
      onIndexChange(currentIndex - 1);
    }
  }, [currentIndex, hasPrev, onIndexChange]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      onIndexChange(currentIndex + 1);
    }
  }, [currentIndex, hasNext, onIndexChange]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          handleClose();
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
  }, [open, handleClose, handlePrev, handleNext]);

  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open || !item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xl"
      onClick={handleClose}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          handleClose();
        }}
        className="absolute right-4 top-4 z-20 flex size-10 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
      >
        <XIcon className="size-5" />
      </button>

      {hasPrev && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handlePrev();
          }}
          className="absolute left-4 top-1/2 z-20 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white sm:left-6"
        >
          <ChevronLeftIcon className="size-6" />
        </button>
      )}

      {hasNext && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleNext();
          }}
          className="absolute right-4 top-1/2 z-20 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white sm:right-6"
        >
          <ChevronRightIcon className="size-6" />
        </button>
      )}

      <MediaContextMenu onDownload={item.onDownload}>
        <div
          className="relative max-h-full max-w-full"
          onClick={(event) => event.stopPropagation()}
        >
          {item.onDownload && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                item.onDownload?.();
              }}
              className="absolute right-2 top-2 z-20 flex size-9 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
            >
              <DownloadIcon className="size-4" />
            </button>
          )}

          {item.type === 'video' ? (
            <div className="relative">
              <video
                src={item.url}
                controls
                controlsList="nodownload"
                autoPlay
                className="max-h-[85vh] max-w-full rounded-lg object-contain"
              >
                <track kind="captions" />
              </video>
              <WatermarkOverlay />
            </div>
          ) : (
            <img
              src={item.url}
              alt={item.alt ?? 'Preview'}
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            />
          )}
        </div>
      </MediaContextMenu>
    </div>
  );
}
