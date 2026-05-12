'use client';

import {
  getAssetMediaUrl,
  getAssetThumbnailUrl,
  isAssetCompleted,
  isAssetProcessing,
} from '@/assets/business/asset-mapper';
import type { Asset } from '@/assets/types';
import { Button } from '@/components/ui/button';
import { getImageModelLabel } from '@/image/config/image-models';
import { cn, generateDownloadFilename } from '@/lib/utils';
import { getVideoModelLabel } from '@/video/config/video-models';
import {
  AlertCircle,
  Copy,
  DownloadIcon,
  ImageIcon,
  Loader2,
  RefreshCw,
  VideoIcon,
} from 'lucide-react';
import { useCallback } from 'react';

interface ResultCardProps {
  asset: Asset;
  isHighlighted?: boolean;
  immersive?: boolean;
  onDelete?: (asset: Asset) => void;
  onReprompt?: (prompt: string) => void;
  onPreview?: (asset: Asset, mediaIndex?: number) => void;
}

function getModelDisplayName(asset: Asset): string {
  if (!asset.modelId) return 'Unknown Model';
  return (
    getImageModelLabel(asset.modelId) ??
    getVideoModelLabel(asset.modelId) ??
    asset.modelId
  );
}

function formatTime(date: Date): string {
  const d = new Date(date);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ResultCard({
  asset,
  isHighlighted = false,
  immersive = false,
  onDelete,
  onReprompt,
  onPreview,
}: ResultCardProps) {
  const completed = isAssetCompleted(asset);
  const processing = isAssetProcessing(asset);
  const failed = asset.status === 'FAILED';
  const mediaUrl = getAssetMediaUrl(asset);

  const isImage = asset.type === 'image';
  const isVideo = asset.type === 'video';

  const handleDownload = useCallback(() => {
    if (!mediaUrl) return;
    const type = asset.type === 'video' ? 'video' : 'image';
    const filename = generateDownloadFilename(type, asset.prompt);
    const downloadUrl = `/api/download?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(filename)}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [asset, mediaUrl]);

  // Multiple images support
  const allImageUrls =
    isImage && completed
      ? asset.outputImageUrlsR2?.length
        ? asset.outputImageUrlsR2
        : (asset.outputImageUrls ?? [])
      : [];

  return (
    <div
      className={cn(
        'rounded-xl bg-foreground/[0.06]',
        isHighlighted && 'ring-2 ring-primary shadow-lg'
      )}
    >
      {/* Header: site · mode · model · time */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/70">
          {isImage ? 'Text to Image' : 'Text to Video'}
        </span>
        <span className="text-foreground/20">|</span>
        <span>{getModelDisplayName(asset)}</span>
        <span className="ml-auto text-[10px] whitespace-nowrap">
          {formatTime(asset.createdAt)}
        </span>
      </div>

      {/* Prompt */}
      {asset.prompt && (
        <div className="px-4 pb-2">
          <p className="text-sm text-foreground/80 line-clamp-2 leading-relaxed">
            {asset.prompt}
          </p>
        </div>
      )}

      {/* Media area - image on the left, not full width */}
      <div className="px-4 pb-2">
        {completed && (
          <>
            {isImage && allImageUrls.length > 0 && (
              <div className={cn('flex gap-2 flex-wrap')}>
                {allImageUrls.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    className="relative overflow-hidden rounded-lg group cursor-zoom-in"
                    onClick={() => onPreview?.(asset, i)}
                  >
                    <img
                      src={url}
                      alt={asset.prompt || `Generated image ${i + 1}`}
                      className="h-48 w-auto object-cover rounded-lg transition-transform duration-200 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}

            {isVideo && mediaUrl && (
              <button
                type="button"
                className="relative overflow-hidden rounded-lg cursor-zoom-in"
                onClick={() => onPreview?.(asset, 0)}
              >
                <video
                  src={mediaUrl}
                  className="h-48 w-auto object-cover rounded-lg"
                  controls
                  preload="metadata"
                  muted
                >
                  <track kind="captions" />
                </video>
              </button>
            )}
          </>
        )}

        {processing && (
          <div className="flex items-center gap-3 rounded-lg bg-muted/30 p-4">
            <Loader2 className="size-5 animate-spin text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Generating...</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {asset.status === 'PENDING' && 'Waiting in queue'}
                {asset.status === 'IN_QUEUE' && 'Processing in queue'}
                {asset.status === 'IN_PROGRESS' && 'Generation in progress'}
              </p>
            </div>
          </div>
        )}

        {failed && (
          <div className="flex items-center gap-3 rounded-lg bg-destructive/10 p-4">
            <AlertCircle className="size-5 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">
                Generation Failed
              </p>
              {asset.errorMessage && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {asset.errorMessage}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 px-3 pb-3">
        {asset.prompt && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => onReprompt?.(asset.prompt!)}
          >
            <Copy className="size-3" />
            Reprompt
          </Button>
        )}

        {completed && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => onReprompt?.(asset.prompt!)}
          >
            <RefreshCw className="size-3" />
            Regenerate
          </Button>
        )}

        {completed && mediaUrl && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={handleDownload}
          >
            <DownloadIcon className="size-3" />
            Download
          </Button>
        )}
      </div>
    </div>
  );
}
