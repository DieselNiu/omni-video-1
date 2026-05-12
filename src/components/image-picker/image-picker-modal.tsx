'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useAssets } from '@/hooks/use-assets';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useCallback, useEffect, useRef } from 'react';

interface ImagePickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImageSelect: (imageUrl: string) => void;
  onUploadClick: () => void;
}

export function ImagePickerModal({
  open,
  onOpenChange,
  onImageSelect,
  onUploadClick,
}: ImagePickerModalProps) {
  const t = useTranslations('ImagePicker');
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Prefetch assets on mount so data is ready when dialog opens (no layout shift)
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAssets({
      type: 'image',
      sort: 'latest',
      pageSize: 30,
    });

  const assets = data?.pages.flatMap((page) => page.assets) ?? [];

  // Infinite scroll observer
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

  const handleImageClick = useCallback(
    (imageUrl: string) => {
      onImageSelect(imageUrl);
      onOpenChange(false);
    },
    [onImageSelect, onOpenChange]
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
        {/* Hidden title for a11y */}
        <VisuallyHidden>
          <DialogTitle>{t('title')}</DialogTitle>
        </VisuallyHidden>

        {/* Content - Scrollable */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden p-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#2a2a2a] [&::-webkit-scrollbar-thumb]:rounded-full"
        >
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {/* Upload Card - Always visible regardless of loading state */}
            <button
              type="button"
              onClick={handleUpload}
              className="aspect-square rounded-2xl border-[1.5px] border-dashed border-zinc-600 bg-transparent hover:bg-zinc-800/40 transition-colors duration-200 flex flex-col items-center justify-center gap-1.5"
            >
              <Upload className="w-7 h-7 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-300">
                {t('upload')}
              </span>
              <span className="text-[10px] text-zinc-500 text-center leading-tight">
                .png, .jpg, .webp,
                <br />
                .heic, .avif
              </span>
            </button>

            {/* Loading skeletons or History Images - same grid, no layout shift */}
            {isLoading
              ? Array.from({ length: 17 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-2xl bg-zinc-800/50 animate-pulse"
                  />
                ))
              : assets.map((asset) => {
                  const imageUrl =
                    asset.outputImageUrlsR2?.[0] ||
                    asset.outputImageUrls?.[0] ||
                    asset.thumbnailUrl;

                  if (!imageUrl) return null;

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => handleImageClick(imageUrl)}
                      className="aspect-square rounded-2xl overflow-hidden bg-zinc-800 hover:opacity-80 transition-opacity duration-150 relative cursor-pointer"
                    >
                      <Image
                        src={imageUrl}
                        alt={asset.prompt || 'Generated image'}
                        fill
                        sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 170px"
                        className="object-cover"
                        loading="lazy"
                      />
                    </button>
                  );
                })}
          </div>

          {/* Loading More */}
          {isFetchingNextPage && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          )}

          {/* Sentinel for infinite scroll */}
          {!isLoading && <div ref={sentinelRef} className="h-2" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
