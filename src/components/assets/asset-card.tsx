'use client';

import {
  getAssetMediaUrl,
  getAssetThumbnailUrl,
  isAssetCompleted,
  isAssetProcessing,
} from '@/assets/business/asset-mapper';
import type { Asset } from '@/assets/types';
import { MediaContextMenu } from '@/components/ui/media-context-menu';
import {
  WatermarkOverlay,
  useVideoDownloadGuard,
} from '@/components/watermark-overlay';
import { useToggleAssetFavorite } from '@/hooks/use-asset-favorites';
import { cn, generateDownloadFilename } from '@/lib/utils';
import {
  DownloadIcon,
  FileIcon,
  ImageIcon,
  Loader2Icon,
  PlayIcon,
  Trash2Icon,
  VideoIcon,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { AssetFavoriteButton } from './asset-favorite-button';

interface AssetCardProps {
  asset: Asset;
  onClick: () => void;
  onDelete?: (asset: Asset) => void;
  isFavorited?: boolean;
}

export function AssetCard({
  asset,
  onClick,
  onDelete,
  isFavorited: initialFavorited = false,
}: AssetCardProps) {
  const thumbnailUrl = getAssetThumbnailUrl(asset);
  const completed = isAssetCompleted(asset);
  const processing = isAssetProcessing(asset);
  const { guardDownload } = useVideoDownloadGuard();
  const toggleFavorite = useToggleAssetFavorite();
  const [isFavorited, setIsFavorited] = useState(initialFavorited);

  const isImage = asset.type === 'image';
  const isVideo = asset.type === 'video';

  const doDownload = useCallback(() => {
    const mediaUrl = getAssetMediaUrl(asset);
    if (!mediaUrl) return;

    const download = () => {
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
      guardDownload(download);
    } else {
      download();
    }
  }, [asset, guardDownload]);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    doDownload();
  };

  const handleFavorite = useCallback(() => {
    toggleFavorite.mutate(
      { assetId: asset.id },
      {
        onSuccess: (data) => {
          setIsFavorited(data.favorited);
        },
      }
    );
  }, [asset.id, toggleFavorite]);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(asset);
  };

  return (
    <MediaContextMenu
      onDownload={completed ? doDownload : undefined}
      onFavorite={completed ? handleFavorite : undefined}
      isFavorited={isFavorited}
    >
      <div
        className={cn(
          'group relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-secondary transition-all',
          !completed && 'opacity-70'
        )}
        onClick={onClick}
      >
        {thumbnailUrl && completed ? (
          isImage ? (
            <img
              src={thumbnailUrl}
              alt={asset.prompt ?? ''}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : isVideo ? (
            <div className="relative h-full w-full">
              <video
                src={thumbnailUrl}
                className="h-full w-full object-cover"
                muted
                loop
                playsInline
                controlsList="nodownload"
                onMouseEnter={(event) => event.currentTarget.play()}
                onMouseLeave={(event) => {
                  event.currentTarget.pause();
                  event.currentTarget.currentTime = 0;
                }}
              />
              <WatermarkOverlay />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <FileIcon className="size-12 text-muted-foreground" />
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center">
            {processing ? (
              <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
            ) : isImage ? (
              <ImageIcon className="size-12 text-muted-foreground" />
            ) : isVideo ? (
              <VideoIcon className="size-12 text-muted-foreground" />
            ) : (
              <FileIcon className="size-12 text-muted-foreground" />
            )}
          </div>
        )}

        {isVideo && (
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs text-white backdrop-blur-sm">
            <PlayIcon className="size-3 fill-current" />
            VIDEO
          </div>
        )}

        {processing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
              {asset.status}
            </span>
          </div>
        )}

        {asset.status === 'FAILED' && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/20">
            <span className="rounded-full bg-red-500/80 px-3 py-1 text-xs font-medium text-white">
              FAILED
            </span>
          </div>
        )}

        {/* Hover overlay with action buttons */}
        {completed && (
          <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            {/* Top left: Favorite button */}
            <div className="absolute left-2 top-2">
              <AssetFavoriteButton
                assetId={asset.id}
                isFavorited={isFavorited}
                size="sm"
              />
            </div>

            {/* Top right: Download and Delete buttons */}
            <div className="absolute right-2 top-2 flex items-center gap-1">
              <button
                type="button"
                onClick={handleDownload}
                className="flex size-6 items-center justify-center rounded-md bg-white/70 text-gray-700 backdrop-blur-md transition-colors hover:bg-white/90"
              >
                <DownloadIcon className="size-3" />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex size-6 items-center justify-center rounded-md bg-white/70 text-gray-700 backdrop-blur-md transition-colors hover:bg-white/90"
              >
                <Trash2Icon className="size-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </MediaContextMenu>
  );
}
