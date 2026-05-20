'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useAssets } from '@/hooks/use-assets';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef } from 'react';

interface AssetPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the R2 url of the asset the user clicked. */
  onAssetSelect: (assetUrl: string) => void;
  /** Called when the "Upload" tile is clicked — open a native file picker. */
  onUploadClick: () => void;
  /** Filter the history grid. Default 'image'. */
  assetType?: 'image' | 'video';
}

/**
 * Asset picker — opens when a user clicks an upload slot. Shows a dashed
 * "Upload" card plus the user's past generations as a scrollable grid.
 * Selecting an asset reuses its R2 url so there's no re-upload.
 *
 * Ported from image-website/src/components/image-picker/image-picker-modal.tsx
 * to keep the upload UX identical across our two sites.
 */
export function AssetPickerModal({
  open,
  onOpenChange,
  onAssetSelect,
  onUploadClick,
  assetType = 'image',
}: AssetPickerModalProps) {
  const t = useTranslations('ImagePicker');
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Prefetch with a smaller initial page so first paint is fast; infinite
  // scroll pulls more as the user scrolls.
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAssets({
      type: assetType,
      sort: 'latest',
      pageSize: 18,
    });

  const assets = data?.pages.flatMap((page) => page.assets) ?? [];

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || !open) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      {
        root: scrollRef.current,
        rootMargin: '200px',
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, open]);

  const handleAssetClick = useCallback(
    (assetUrl: string) => {
      onAssetSelect(assetUrl);
      onOpenChange(false);
    },
    [onAssetSelect, onOpenChange]
  );

  const handleUpload = useCallback(() => {
    onUploadClick();
    onOpenChange(false);
  }, [onUploadClick, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!bg-[#1a1a1a] !border-[#333] !rounded-2xl !p-1.5 !gap-0 !shadow-2xl sm:!max-w-[95vw] md:!max-w-[900px] lg:!max-w-[1100px] !max-h-[85vh] overflow-hidden flex flex-col"
      >
        <VisuallyHidden>
          <DialogTitle>{t('title')}</DialogTitle>
        </VisuallyHidden>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden p-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#2a2a2a] [&::-webkit-scrollbar-thumb]:rounded-full"
        >
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            <button
              type="button"
              onClick={handleUpload}
              className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-zinc-600 bg-transparent transition-colors duration-200 hover:bg-zinc-800/40"
            >
              <Upload className="h-7 w-7 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-300">
                {t('upload')}
              </span>
              <span className="text-center text-[10px] leading-tight text-zinc-500">
                {assetType === 'video'
                  ? '.mp4, .webm, .mov'
                  : '.png, .jpg, .webp'}
              </span>
            </button>

            {isLoading
              ? Array.from({ length: 11 }).map((_, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton placeholders
                    key={i}
                    className="aspect-square animate-pulse rounded-2xl bg-zinc-800/50"
                  />
                ))
              : assets.map((asset) => {
                  // The actual r2Url we hand back to the caller is the
                  // full-res output. The grid thumbnail prefers
                  // `thumbnailUrl` (a much smaller pre-resized image)
                  // so a screen of 18 tiles paints in a fraction of the
                  // bandwidth a full-res page would take.
                  const fullUrl =
                    assetType === 'video'
                      ? asset.outputVideoUrl ||
                        asset.outputVideoUrlR2 ||
                        asset.thumbnailUrl
                      : asset.outputImageUrlsR2?.[0] ||
                        asset.outputImageUrls?.[0] ||
                        asset.thumbnailUrl;
                  const thumb = asset.thumbnailUrl || fullUrl;
                  if (!fullUrl || !thumb) return null;

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => handleAssetClick(fullUrl)}
                      className="relative aspect-square cursor-pointer overflow-hidden rounded-2xl bg-zinc-800 transition-opacity duration-150 hover:opacity-80"
                    >
                      <img
                        src={thumb}
                        alt={asset.prompt || 'Generated asset'}
                        width={180}
                        height={180}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                  );
                })}
          </div>

          {isFetchingNextPage && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          )}

          {!isLoading && <div ref={sentinelRef} className="h-2" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
