'use client';

import { getAssetMediaUrl } from '@/assets/business/asset-mapper';
import type { Asset } from '@/assets/types';
import { Button } from '@/components/ui/button';
import {
  type MediaPreviewItem,
  MediaPreviewModal,
} from '@/components/ui/media-preview-modal';
import { useAppFeed } from '@/hooks/use-app-feed';
import { useDeleteAsset } from '@/hooks/use-assets';
import { useElapsedTime } from '@/hooks/use-elapsed-time';
import { useSimulatedProgress } from '@/hooks/use-simulated-progress';
import { useToast } from '@/hooks/use-toast';
import { LocaleLink } from '@/i18n/navigation';
import { getImageModelLabel } from '@/image/config/image-models';
import { cn, downloadImage, generateDownloadFilename } from '@/lib/utils';
import { Routes } from '@/routes';
import type { ActiveGeneration } from '@/stores/app-page-store';
import { useAppPageStore } from '@/stores/app-page-store';
import { getVideoModelLabel } from '@/video/config/video-models';
import { AlertCircle, LibraryBig, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EffectPreviewVideo } from '../effect/effect-preview-video';
import { useVideoDownloadGuard } from '../watermark-overlay';
import { EmptyShowcase } from './empty-showcase';
import { ResultCard } from './result-card';
import { ResultCardLoading } from './result-card-loading';

interface ResultFeedProps {
  taskId?: string;
  effectPreview?: { videoUrl: string; poster?: string };
  /** When true, hide the All/Image/Video filter tabs and Assets link and
   *  render a simple "My Videos" header instead. Used by /effect/[slug]
   *  pages where the feed is scoped to a single effect's results. */
  effectMode?: boolean;
}

const FILTER_TABS = [
  { value: 'all' as const, label: 'All' },
  { value: 'image' as const, label: 'Image' },
  { value: 'video' as const, label: 'Video' },
];

type FeedPreviewItem = MediaPreviewItem & {
  assetId: string;
};

function getActiveModelDisplayName(modelId?: string): string {
  if (!modelId) return 'Generating';
  return getImageModelLabel(modelId) ?? getVideoModelLabel(modelId) ?? modelId;
}

/**
 * Renders an in-progress generation from Zustand (optimistic card).
 * Matches the ResultCard layout with a loading video animation (same as aiseedance2).
 */
function ActiveGenerationCard({
  generation,
}: { generation: ActiveGeneration; immersive?: boolean }) {
  const isImage = generation.mediaType === 'image';
  const isVideo = generation.mediaType === 'video';
  const elapsedTime = useElapsedTime(generation.startTime, true);
  const displayProgress = useSimulatedProgress(
    elapsedTime,
    generation.progress,
    isVideo
  );

  // Once the poll reports the final URL, render the completed media in place
  // of the loading animation. The eventual ResultCard swap will reuse the same
  // URL (browser image cache hit), so the transition is visually seamless —
  // no flash of a previous generation's image.
  const completedImage = isImage ? generation.outputImageUrl : undefined;
  const completedVideo = isVideo ? generation.outputVideoUrl : undefined;
  const hasCompletedMedia = Boolean(completedImage || completedVideo);
  const hasFailed = generation.status === 'FAILED';

  return (
    <div className="rounded-xl bg-foreground/[0.06]">
      {/* Header — matches ResultCard */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/70">
          {isImage ? 'Text to Image' : 'Text to Video'}
        </span>
        <span className="text-foreground/20">|</span>
        <span>{getActiveModelDisplayName(generation.modelId)}</span>
        <span className="ml-auto text-[10px] whitespace-nowrap">just now</span>
      </div>

      {/* Prompt — matches ResultCard */}
      {generation.prompt && (
        <div className="px-4 pb-2">
          <p className="text-sm text-foreground/80 line-clamp-2 leading-relaxed">
            {generation.prompt}
          </p>
        </div>
      )}

      {/* Media area — completed media if ready, FAILED state if errored,
       * otherwise loading animation. */}
      <div className="px-4 pb-2">
        {hasCompletedMedia ? (
          <div className="flex gap-2 flex-wrap">
            {completedImage && (
              <img
                src={completedImage}
                alt={generation.prompt || 'Generated image'}
                className="h-48 w-auto object-cover rounded-lg"
              />
            )}
            {completedVideo && (
              <video
                src={completedVideo}
                className="h-48 w-auto object-cover rounded-lg"
                controls
                preload="metadata"
                muted
              >
                <track kind="captions" />
              </video>
            )}
          </div>
        ) : hasFailed ? (
          <div className="relative aspect-video max-w-md overflow-hidden rounded-lg bg-destructive/5 border border-destructive/20 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <div>
              <p className="font-medium text-destructive text-sm">
                Generation failed
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm break-words">
                {generation.errorMessage || 'The provider rejected this task.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="relative aspect-video max-w-md overflow-hidden rounded-lg bg-black">
            {/* Background loading video */}
            <video
              src="https://assets.movart.ai/landingpage/loading.mp4"
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
                {`${displayProgress}% ${isVideo ? 'Generating video' : 'Generating'}...`}
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
          </div>
        )}
      </div>

      {/* Empty action row — reserve space to match ResultCard height */}
      <div className="h-10" />
    </div>
  );
}

export function ResultFeed({
  taskId,
  effectPreview,
  effectMode = false,
}: ResultFeedProps) {
  const { toast } = useToast();
  const { guardDownload } = useVideoDownloadGuard();
  const {
    feedFilter,
    setFeedFilter,
    panelExpanded,
    setPanelExpanded,
    setRepromptText,
    setMobileTab,
    activeGenerations,
  } = useAppPageStore();
  // In effect mode we only show active (session) generations + the preview
  // video — never the full account feed. Disable the infinite query entirely
  // so we don't leak cross-page history into the effect workspace.
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useAppFeed({ type: feedFilter, enabled: !effectMode });
  const deleteAsset = useDeleteAsset();

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Preview modal state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const allAssets = data?.pages.flatMap((page) => page.assets) ?? [];

  // Active generations as array, filtered by current feed filter, newest first.
  // In effect mode we ignore `feedFilter` (the tabs are hidden) so a stale
  // filter value from the /app store can't accidentally hide active video
  // generations on an effect page.
  const activeGens = useMemo(() => {
    let gens = Array.from(activeGenerations.values());
    if (!effectMode && feedFilter !== 'all') {
      gens = gens.filter((g) => g.mediaType === feedFilter);
    }
    return gens.sort((a, b) => b.startTime - a.startTime);
  }, [activeGenerations, feedFilter, effectMode]);

  // Deduplicate: exclude assets whose IDs match active generations
  const activeIds = useMemo(
    () => new Set(activeGens.map((g) => g.id)),
    [activeGens]
  );
  const dedupedAssets = useMemo(
    () => allAssets.filter((a) => !activeIds.has(a.id)),
    [allAssets, activeIds]
  );
  const previewItems = useMemo<FeedPreviewItem[]>(
    () =>
      dedupedAssets.flatMap<FeedPreviewItem>((asset) => {
        if (asset.type === 'image') {
          const imageUrls = asset.outputImageUrlsR2?.length
            ? asset.outputImageUrlsR2
            : (asset.outputImageUrls ?? []);

          return imageUrls.map((url, index) => ({
            assetId: asset.id,
            type: 'image' as const,
            url,
            alt: asset.prompt || `Generated image ${index + 1}`,
            onDownload: () => {
              void downloadImage(
                url,
                generateDownloadFilename('image', asset.prompt)
              ).catch((error) => {
                console.error('Failed to download preview image:', error);
              });
            },
          }));
        }

        if (asset.type === 'video') {
          const mediaUrl = getAssetMediaUrl(asset);
          if (!mediaUrl) return [];

          return [
            {
              assetId: asset.id,
              type: 'video' as const,
              url: mediaUrl,
              alt: asset.prompt || 'Generated video',
              onDownload: () => {
                guardDownload(() => {
                  void downloadImage(
                    mediaUrl,
                    generateDownloadFilename('video', asset.prompt, 'mp4')
                  ).catch((error) => {
                    console.error('Failed to download preview video:', error);
                  });
                });
              },
            },
          ];
        }

        return [];
      }),
    [dedupedAssets, guardDownload]
  );
  const previewIndexesByAsset = useMemo(() => {
    const indexMap = new Map<string, number[]>();

    previewItems.forEach((item, index) => {
      const indexes = indexMap.get(item.assetId);
      if (indexes) {
        indexes.push(index);
      } else {
        indexMap.set(item.assetId, [index]);
      }
    });

    return indexMap;
  }, [previewItems]);

  const hasAnyContent = activeGens.length > 0 || dedupedAssets.length > 0;

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) {
        fetchNextPage();
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Scroll to highlighted card on mount
  useEffect(() => {
    if (!taskId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-asset-id="${taskId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [taskId, allAssets.length]);

  const handleDelete = useCallback(
    (asset: Asset) => {
      if (!window.confirm('Are you sure you want to delete this creation?'))
        return;

      deleteAsset.mutate(
        { id: asset.id },
        {
          onSuccess: () => {
            toast({ title: 'Creation deleted successfully' });
          },
          onError: () => {
            toast({
              title: 'Failed to delete creation',
              variant: 'destructive',
            });
          },
        }
      );
    },
    [deleteAsset, toast]
  );

  const handlePreview = useCallback(
    (asset: Asset, mediaIndex = 0) => {
      const index = previewIndexesByAsset.get(asset.id)?.[mediaIndex];
      if (typeof index === 'number') {
        setPreviewIndex(index);
        setPreviewOpen(true);
      }
    },
    [previewIndexesByAsset]
  );

  const handleReprompt = useCallback(
    (prompt: string) => {
      setRepromptText(prompt);
      setPanelExpanded(true);
      setMobileTab('create');
    },
    [setRepromptText, setPanelExpanded, setMobileTab]
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header: effect-mode renders a simple "My Videos" title; regular
          mode renders the All/Image/Video filter tabs + Assets link. */}
      {effectMode ? (
        <div className="flex items-center gap-2 px-4 py-2.5">
          <LibraryBig className="size-4 text-foreground/70" />
          <span className="text-sm font-semibold text-foreground/90">
            My Videos
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1 px-4 py-2">
          {FILTER_TABS.map((tab) => (
            <Button
              key={tab.value}
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 text-xs',
                feedFilter === tab.value && 'bg-muted font-medium'
              )}
              onClick={() => setFeedFilter(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground"
              asChild
            >
              <LocaleLink href={Routes.Assets}>
                <LibraryBig className="size-3.5" />
                Assets
              </LocaleLink>
            </Button>
          </div>
        </div>
      )}

      {/* Effect-mode empty state: preview video is pinned (no scroll, no
          feed padding) so the fixed 9:16 card sits centered regardless of
          panel height. Active generations fall through to the scrollable
          feed below so users can see progress + result cards stacking. */}
      {effectMode && effectPreview && !hasAnyContent ? (
        <div className="flex flex-1 items-center justify-center overflow-hidden px-3 pb-3">
          <EffectPreviewVideo
            videoUrl={effectPreview.videoUrl}
            poster={effectPreview.poster}
          />
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full"
        >
          <div className="p-4 space-y-3">
            {/* Active generation cards (optimistic) */}
            {activeGens.map((gen) => (
              <ActiveGenerationCard
                key={gen.id}
                generation={gen}
                immersive={!panelExpanded}
              />
            ))}

            {/* Loading state */}
            {isLoading && <ResultCardLoading count={3} />}

            {/* Empty state (non-effect pages) */}
            {!isLoading && !hasAnyContent && !effectMode && <EmptyShowcase />}

            {/* Asset cards (from database) — never rendered in effect mode
             * because the infinite query is disabled and `dedupedAssets` is
             * always empty there. Guarding explicitly keeps intent obvious. */}
            {!effectMode &&
              !isLoading &&
              dedupedAssets.map((asset) => (
                <div key={asset.id} data-asset-id={asset.id}>
                  <ResultCard
                    asset={asset}
                    isHighlighted={taskId === asset.id}
                    immersive={!panelExpanded}
                    onDelete={handleDelete}
                    onReprompt={handleReprompt}
                    onPreview={handlePreview}
                  />
                </div>
              ))}

            {/* Sentinel for infinite scroll — skipped in effect mode */}
            {!effectMode && <div ref={sentinelRef} className="h-8" />}

            {/* Loading more indicator */}
            {isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* End of feed */}
            {!effectMode &&
              !hasNextPage &&
              dedupedAssets.length > 0 &&
              !isLoading && (
                <p className="text-center text-xs text-muted-foreground py-4">
                  No more results
                </p>
              )}
          </div>
        </div>
      )}

      {/* Preview modal */}
      <MediaPreviewModal
        items={previewItems}
        currentIndex={previewIndex}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onIndexChange={setPreviewIndex}
      />
    </div>
  );
}
