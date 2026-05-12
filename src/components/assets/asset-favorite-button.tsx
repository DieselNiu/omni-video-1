'use client';

import { Button } from '@/components/ui/button';
import { useToggleAssetFavorite } from '@/hooks/use-asset-favorites';
import { cn } from '@/lib/utils';
import { HeartIcon, Loader2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AssetFavoriteButtonProps {
  assetId: string;
  isFavorited: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'icon' | 'full';
  className?: string;
}

export function AssetFavoriteButton({
  assetId,
  isFavorited,
  size = 'md',
  variant = 'icon',
  className,
}: AssetFavoriteButtonProps) {
  const t = useTranslations('Dashboard.assets.actions');
  const toggleFavorite = useToggleAssetFavorite();

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    toggleFavorite.mutate({ assetId });
  };

  const sizeClasses = {
    sm: 'size-6',
    md: 'size-8',
    lg: 'size-9',
  };

  const iconSizes = {
    sm: 'size-3',
    md: 'size-3.5',
    lg: 'size-4',
  };

  if (variant === 'full') {
    return (
      <Button
        variant="outline"
        onClick={handleClick}
        disabled={toggleFavorite.isPending}
        className={className}
      >
        {toggleFavorite.isPending ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <HeartIcon
            className={cn(isFavorited && 'fill-current text-red-500')}
          />
        )}
        {isFavorited ? t('unfavorite') : t('favorite')}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={toggleFavorite.isPending}
      aria-label={isFavorited ? t('unfavorite') : t('favorite')}
      className={cn(
        'rounded-md bg-white/70 text-gray-700 backdrop-blur-md transition-all hover:bg-white/90 min-h-[48px] min-w-[48px]',
        sizeClasses[size],
        isFavorited && 'text-red-500',
        className
      )}
    >
      {toggleFavorite.isPending ? (
        <Loader2Icon className={cn('animate-spin', iconSizes[size])} />
      ) : (
        <HeartIcon
          className={cn(iconSizes[size], isFavorited && 'fill-current')}
        />
      )}
    </Button>
  );
}
