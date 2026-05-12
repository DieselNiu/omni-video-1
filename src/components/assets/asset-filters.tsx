'use client';

import type { AssetSort, AssetType } from '@/assets/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  CheckIcon,
  ChevronDownIcon,
  ClapperboardIcon,
  Grid2x2Icon,
  Grid3x3Icon,
  GridIcon,
  HeartIcon,
  ImageIcon,
  LayersIcon,
  LayoutGridIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AssetFiltersProps {
  type: 'all' | AssetType;
  onTypeChange: (value: 'all' | AssetType) => void;
  favoritesOnly: boolean;
  onFavoritesChange: (value: boolean) => void;
  sort: AssetSort;
  onSortChange: (value: AssetSort) => void;
  viewSize: 'small' | 'medium' | 'large';
  onViewSizeChange: (value: 'small' | 'medium' | 'large') => void;
}

export function AssetFilters({
  type,
  onTypeChange,
  favoritesOnly,
  onFavoritesChange,
  sort,
  onSortChange,
  viewSize,
  onViewSizeChange,
}: AssetFiltersProps) {
  const t = useTranslations('Dashboard.assets.filters');

  const typeLabels: Partial<Record<'all' | AssetType, string>> = {
    all: t('type'),
    image: t('images'),
    video: t('videos'),
  };

  const sortLabels: Record<AssetSort, string> = {
    latest: t('latest'),
    oldest: t('oldest'),
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      {/* Left group: Type dropdown + Favorites toggle */}
      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-1 px-2 text-sm font-normal">
              {type === 'all' ? t('type') : (typeLabels[type] ?? type)}
              <ChevronDownIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => onTypeChange('all')}
              className="gap-2"
            >
              <LayersIcon className="size-4" />
              {t('all')}
              {type === 'all' && <CheckIcon className="ml-auto size-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onTypeChange('image')}
              className="gap-2"
            >
              <ImageIcon className="size-4" />
              {t('images')}
              {type === 'image' && <CheckIcon className="ml-auto size-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onTypeChange('video')}
              className="gap-2"
            >
              <ClapperboardIcon className="size-4" />
              {t('videos')}
              {type === 'video' && <CheckIcon className="ml-auto size-4" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          className={cn(
            'gap-2 px-2 text-sm font-normal',
            favoritesOnly && 'text-red-500'
          )}
          onClick={() => onFavoritesChange(!favoritesOnly)}
        >
          <HeartIcon
            className={cn('size-4', favoritesOnly && 'fill-current')}
          />
          {t('favorites')}
        </Button>
      </div>

      {/* Right group: Sort dropdown + View toggle */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-1 px-2 text-sm font-normal">
              {sortLabels[sort]}
              <ChevronDownIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onSortChange('latest')}
              className="gap-2"
            >
              {t('latest')}
              {sort === 'latest' && <CheckIcon className="ml-auto size-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onSortChange('oldest')}
              className="gap-2"
            >
              {t('oldest')}
              {sort === 'oldest' && <CheckIcon className="ml-auto size-4" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 min-h-[48px] min-w-[48px]"
              aria-label={t('viewToggle')}
            >
              <GridIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onViewSizeChange('small')}
              className="gap-2"
            >
              <Grid3x3Icon className="size-4" />
              {t('viewSmall')}
              {viewSize === 'small' && <CheckIcon className="ml-auto size-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onViewSizeChange('medium')}
              className="gap-2"
            >
              <LayoutGridIcon className="size-4" />
              {t('viewMedium')}
              {viewSize === 'medium' && (
                <CheckIcon className="ml-auto size-4" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onViewSizeChange('large')}
              className="gap-2"
            >
              <Grid2x2Icon className="size-4" />
              {t('viewLarge')}
              {viewSize === 'large' && <CheckIcon className="ml-auto size-4" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
