'use client';

import type { Asset, AssetSort, AssetType } from '@/assets/types';
import { Button } from '@/components/ui/button';
import { useAssets } from '@/hooks/use-assets';
import { Loader2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AssetDeleteDialog } from './asset-delete-dialog';
import { AssetEmptyState } from './asset-empty-state';
import { AssetFilters } from './asset-filters';
import { AssetGrid } from './asset-grid';
import { AssetPreviewModal } from './asset-preview-modal';

const PAGE_SIZE = 20;

export function AssetsPageClient() {
  const t = useTranslations('Dashboard.assets');

  const [type, setType] = useState<'all' | AssetType>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<AssetSort>('latest');
  const [viewSize, setViewSize] = useState<'small' | 'medium' | 'large'>(
    'small'
  );
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useAssets({
    type,
    favorites: favoritesOnly,
    sort,
    pageSize: PAGE_SIZE,
  });

  const assets = useMemo(
    () => data?.pages.flatMap((page) => page.assets) ?? [],
    [data]
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [type, favoritesOnly, sort]);

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
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handleItemClick = (asset: Asset) => {
    const index = assets.findIndex((a) => a.id === asset.id);
    if (index !== -1) {
      setSelectedIndex(index);
    }
  };

  const handleDeleteClick = useCallback((asset: Asset) => {
    setAssetToDelete(asset);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!assetToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/assets/${assetToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete');
      }

      toast.success(t('deleteSuccess'));
      setAssetToDelete(null);
      refetch();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(t('deleteError'));
    } finally {
      setIsDeleting(false);
    }
  }, [assetToDelete, t, refetch]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12">
        <p className="text-destructive">{t('errorLoading')}</p>
        <Button variant="outline" onClick={() => refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <AssetFilters
        type={type}
        onTypeChange={setType}
        favoritesOnly={favoritesOnly}
        onFavoritesChange={setFavoritesOnly}
        sort={sort}
        onSortChange={setSort}
        viewSize={viewSize}
        onViewSizeChange={setViewSize}
      />

      {assets.length === 0 ? (
        <AssetEmptyState />
      ) : (
        <>
          <AssetGrid
            assets={assets}
            onItemClick={handleItemClick}
            onDelete={handleDeleteClick}
            viewSize={viewSize}
          />

          <div ref={sentinelRef} className="h-8" />
          {isFetchingNextPage && (
            <div className="flex justify-center py-6">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </>
      )}

      <AssetPreviewModal
        assets={assets}
        currentIndex={selectedIndex}
        open={selectedIndex >= 0}
        onOpenChange={(open) => !open && setSelectedIndex(-1)}
        onIndexChange={setSelectedIndex}
      />

      <AssetDeleteDialog
        open={assetToDelete !== null}
        onOpenChange={(open) => !open && setAssetToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
      />
    </div>
  );
}
