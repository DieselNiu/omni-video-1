'use client';

import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

interface CheckinRewardGridProps {
  rewards: number[];
  currentDay: number;
  checkedDays: number[];
  isCompleted: boolean;
}

const BONUS_MAP: Record<number, string> = {
  3: '2x',
  7: '3x',
};

export function CheckinRewardGrid({
  rewards,
  currentDay,
  checkedDays,
  isCompleted,
}: CheckinRewardGridProps) {
  const t = useTranslations('DailyCheckin');
  const items: ReactNode[] = [];

  for (let index = 0; index < rewards.length; index++) {
    const reward = rewards[index];
    const day = index + 1;
    const isClaimed = checkedDays.includes(day);
    const isCurrent =
      !isCompleted && !isClaimed && day === Math.max(currentDay, 1);
    const bonusLabel = BONUS_MAP[day];

    if (index > 0) {
      const prevClaimed = checkedDays.includes(day - 1);
      items.push(
        <div
          key={`line-${day}`}
          className={cn(
            'hidden h-px min-w-1 flex-1 self-center transition-colors sm:block',
            prevClaimed && isClaimed
              ? 'bg-amber-400/60'
              : prevClaimed
                ? 'bg-gradient-to-r from-amber-400/60 to-muted-foreground/15'
                : 'bg-muted-foreground/15'
          )}
        />
      );
    }

    items.push(
      <div
        key={`day-${day}`}
        className={cn(
          'relative min-w-0 basis-0 flex-1 rounded-2xl border px-1.5 py-1.5 text-center transition-all sm:px-1.5 sm:py-2',
          'border-white/8 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
          isClaimed &&
            'border-amber-300 bg-gradient-to-b from-[#F7D24B] via-[#F4C430] to-[#D89E16] shadow-[0_10px_24px_rgba(245,158,11,0.2)]',
          isCurrent &&
            'border-amber-300/80 bg-gradient-to-b from-amber-300/16 to-transparent shadow-[0_0_0_1px_rgba(251,191,36,0.12)]'
        )}
      >
        {bonusLabel && (
          <div
            className="absolute -right-1.5 -top-2 z-10 inline-flex h-6 min-w-10 items-center justify-center rounded-full px-2 text-[10px] font-bold leading-none text-black sm:-right-2 sm:-top-2"
            style={{
              backgroundColor: '#F4C430',
              backgroundImage: 'none',
              boxShadow: 'none',
              filter: 'none',
              opacity: 1,
              isolation: 'isolate',
              WebkitMaskImage: 'none',
              maskImage: 'none',
            }}
          >
            {bonusLabel}
          </div>
        )}

        <div
          className={cn(
            'mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold leading-none sm:h-8 sm:w-8 sm:text-sm',
            isClaimed
              ? 'bg-black/12 text-black'
              : isCurrent
                ? 'bg-amber-300/15 text-amber-200'
                : 'bg-white/[0.06] text-white/58'
          )}
        >
          +{reward}
        </div>

        <div
          className={cn(
            'mt-1 text-[9px] font-semibold tracking-wide sm:text-[10px]',
            isClaimed
              ? 'text-black/80'
              : isCurrent
                ? 'text-amber-100'
                : 'text-white/60'
          )}
        >
          {t('dayLabel', { day })}
        </div>
      </div>
    );
  }

  return (
    <div className="grid w-full min-w-0 grid-cols-4 gap-2 sm:flex sm:items-center sm:gap-0">
      {items}
    </div>
  );
}
