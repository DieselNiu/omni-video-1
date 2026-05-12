'use client';

import { getAssetMediaUrl } from '@/assets/business/asset-mapper';
import type { Asset } from '@/assets/types';
import { MediaContextMenu } from '@/components/ui/media-context-menu';
import {
  WatermarkOverlay,
  useVideoDownloadGuard,
} from '@/components/watermark-overlay';
import { useToggleAssetFavorite } from '@/hooks/use-asset-favorites';
import { generateDownloadFilename } from '@/lib/utils';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface AssetPreviewModalProps {
  assets: Asset[];
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}

export function AssetPreviewModal({
  assets,
  currentIndex,
  open,
  onOpenChange,
  onIndexChange,
}: AssetPreviewModalProps) {
  const asset = assets[currentIndex];
  const mediaUrl = asset ? getAssetMediaUrl(asset) : null;
  const { guardDownload } = useVideoDownloadGuard();
  const toggleFavorite = useToggleAssetFavorite();
  const [isFavorited, setIsFavorited] = useState(false);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < assets.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev) {
      onIndexChange(currentIndex - 1);
    }
  }, [hasPrev, currentIndex, onIndexChange]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      onIndexChange(currentIndex + 1);
    }
  }, [hasNext, currentIndex, onIndexChange]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleFavorite = useCallback(() => {
    if (!asset) return;
    toggleFavorite.mutate(
      { assetId: asset.id },
      {
        onSuccess: (data) => {
          setIsFavorited(data.favorited);
        },
      }
    );
  }, [asset, toggleFavorite]);

  const handleDownload = useCallback(async () => {
    if (!mediaUrl || !asset) return;

    const doDownload = () => {
      const type = asset.type === 'video' ? 'video' : 'image';
      const filename = generateDownloadFilename(type, asset.prompt);
      const downloadUrl = `/api/download?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(filename)}`;

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    if (asset.type === 'video') {
      guardDownload(doDownload);
    } else {
      doDownload();
    }
  }, [mediaUrl, asset, guardDownload]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
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

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open || !asset) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xl"
      onClick={handleClose}
    >
      {/* Close button - screen top right */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
        className="absolute right-4 top-4 z-20 flex size-10 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
      >
        <XIcon className="size-5" />
      </button>

      {/* Left navigation arrow - vertically centered */}
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

      {/* Right navigation arrow - vertically centered */}
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
      <MediaContextMenu
        onDownload={handleDownload}
        onFavorite={handleFavorite}
        isFavorited={isFavorited}
      >
        <div
          className="relative max-h-full max-w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Download button - image top right */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            className="absolute right-2 top-2 z-20 flex size-9 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
          >
            <DownloadIcon className="size-4" />
          </button>

          {/* Media content */}
          {mediaUrl ? (
            asset.type === 'video' ? (
              <div className="relative">
                <video
                  src={mediaUrl}
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
                src={mediaUrl}
                alt={asset.prompt ?? ''}
                className="max-h-[85vh] max-w-full rounded-lg object-contain"
              />
            )
          ) : (
            <div className="flex h-64 w-96 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
              No media available
            </div>
          )}
        </div>
      </MediaContextMenu>
    </div>
  );
}
