'use client';

import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface TierSelectorProps {
  currentIndex: number;
  totalTiers: number;
  onIncrease: () => void;
  onDecrease: () => void;
  className?: string;
}

/**
 * Tier Selector Component
 *
 * Displays up/down arrows for selecting different pricing tiers
 * Up arrow = increase price (higher tier), Down arrow = decrease price (lower tier)
 */
export function TierSelector({
  currentIndex,
  totalTiers,
  onIncrease,
  onDecrease,
  className,
}: TierSelectorProps) {
  // Up arrow increases tier index (higher price)
  const canGoUp = currentIndex < totalTiers - 1;
  // Down arrow decreases tier index (lower price)
  const canGoDown = currentIndex > 0;

  return (
    <div
      className={cn(
        'inline-flex flex-col items-center justify-center rounded-md border border-border/50 bg-muted/30 self-center',
        className
      )}
    >
      <button
        type="button"
        onClick={onIncrease}
        disabled={!canGoUp}
        className={cn(
          'flex items-center justify-center w-8 h-5 rounded-t-md transition-colors',
          canGoUp
            ? 'hover:bg-muted cursor-pointer text-foreground'
            : 'text-muted-foreground/40 cursor-not-allowed'
        )}
        aria-label="Increase tier"
      >
        <ChevronUp className="size-4" />
      </button>
      <button
        type="button"
        onClick={onDecrease}
        disabled={!canGoDown}
        className={cn(
          'flex items-center justify-center w-8 h-5 rounded-b-md transition-colors',
          canGoDown
            ? 'hover:bg-muted cursor-pointer text-foreground'
            : 'text-muted-foreground/40 cursor-not-allowed'
        )}
        aria-label="Decrease tier"
      >
        <ChevronDown className="size-4" />
      </button>
    </div>
  );
}
