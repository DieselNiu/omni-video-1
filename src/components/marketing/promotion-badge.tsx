'use client';

import Container from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { LocaleLink, useLocalePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'omni-promotion-badge-dismissed';
const PROMOTION_ID = 'launch-offer-top-bold-2026-06';
const PROMOTION_END_AT = new Date('2026-06-30T15:59:59Z').getTime();

function getTimeLeft() {
  const totalSeconds = Math.max(
    0,
    Math.floor((PROMOTION_END_AT - Date.now()) / 1000)
  );
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return [days, hours, minutes, seconds].map((value) =>
    String(value).padStart(2, '0')
  );
}

export function PromotionBadge() {
  const t = useTranslations('HomePage.promotionBadge');
  const pathname = useLocalePathname();
  const [isVisible, setIsVisible] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft());

  useEffect(() => {
    setIsVisible(localStorage.getItem(STORAGE_KEY) !== PROMOTION_ID);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeLeft(getTimeLeft());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, PROMOTION_ID);
    setIsVisible(false);
  };

  if (pathname !== '/' || !isVisible) {
    return null;
  }

  return (
    <div className="relative border-b border-yellow-700/25 bg-[#e6b82f] text-[#4a2a13] shadow-[0_1px_0_rgba(0,0,0,0.08)]">
      <Container className="px-4">
        <div className="flex min-h-16 items-center justify-center gap-3 py-2 pr-9 text-center sm:min-h-12">
          <div className="hidden items-center gap-1.5 md:flex">
            {timeLeft.map((value, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <span className="min-w-10 rounded-md bg-white px-2 py-1 font-black text-lg leading-none text-[#6b3d16] shadow-sm tabular-nums">
                  {value}
                </span>
                {index < timeLeft.length - 1 && (
                  <span className="font-black text-[#6b3d16]">:</span>
                )}
              </div>
            ))}
          </div>

          <LocaleLink
            href="/pricing"
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-sm font-semibold transition-opacity hover:opacity-85 sm:flex-none sm:flex-row sm:gap-2 sm:text-base"
          >
            <span className="leading-tight sm:whitespace-normal">
              <span className="font-extrabold">{t('headline')}</span>
              <span className="hidden sm:inline"> {t('lead')} </span>
              <span className="hidden text-lg font-black text-[#b51525] sm:inline sm:text-xl">
                {t('discount')}
              </span>
              <span className="hidden sm:inline"> {t('suffix')}</span>
              <span className="hidden sm:inline" aria-hidden="true">
                {' '}
                🎉
              </span>
            </span>
            <span className="inline-flex shrink-0 rounded-full border border-[#b51525]/20 bg-white px-3 py-1.5 text-xs font-black leading-none text-[#b51525] shadow-sm sm:px-4 sm:py-2 sm:text-sm lg:inline-flex">
              {t('cta')}
            </span>
          </LocaleLink>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('dismiss')}
            onClick={handleDismiss}
            className={cn(
              'absolute right-3 top-1/2 size-7 -translate-y-1/2 shrink-0 rounded-full text-[#6b3d16]/80',
              'hover:bg-yellow-900/10 hover:text-[#3b200f]'
            )}
          >
            <X className="size-4" />
          </Button>
        </div>
      </Container>
    </div>
  );
}
