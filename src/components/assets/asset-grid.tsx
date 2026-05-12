'use client';

import type { Asset } from '@/assets/types';
import { cn } from '@/lib/utils';
import { AssetCard } from './asset-card';

interface AssetGridProps {
  assets: Asset[];
  onItemClick: (asset: Asset) => void;
  onDelete?: (asset: Asset) => void;
  viewSize: 'small' | 'medium' | 'large';
}

const gridClasses = {
  small:
    'grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7',
  medium:
    'grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:gap-4 xl:grid-cols-5',
  large: 'grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:gap-5',
};

export function AssetGrid({
  assets,
  onItemClick,
  onDelete,
  viewSize,
}: AssetGridProps) {
  return (
    <div className={cn('grid', gridClasses[viewSize])}>
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          onClick={() => onItemClick(asset)}
          onDelete={onDelete}
          isFavorited={asset.isFavorite}
        />
      ))}
    </div>
  );
}
