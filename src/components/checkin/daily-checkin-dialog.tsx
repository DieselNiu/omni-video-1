'use client';

import { CheckinRewardGrid } from '@/components/checkin/checkin-reward-grid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCheckinAfterAuth } from '@/hooks/use-checkin-after-auth';
import {
  useClaimDailyCheckin,
  useDailyCheckinStatus,
} from '@/hooks/use-daily-checkin';
import { usePopupOAuth } from '@/hooks/use-popup-oauth';
import { trackEvent } from '@/lib/analytics/track';
import { authClient } from '@/lib/auth-client';
import { CHECKIN_REWARDS } from '@/lib/checkin/constants';
import { useDailyCheckinDialogStore } from '@/stores/daily-checkin-dialog-store';
import { ClockIcon, FilmIcon, ImageIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';

const GRADIENT_CTA =
  'block h-11 w-full max-w-full rounded-2xl border-0 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-400 text-base font-bold text-black shadow-lg shadow-amber-500/25 hover:from-amber-600 hover:via-orange-600 hover:to-yellow-500 sm:h-10 sm:text-lg';

export function DailyCheckinDialog() {
  const t = useTranslations('DailyCheckin');
  const { isOpen, closeDialog } = useDailyCheckinDialogStore();
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const currentUser = session?.user ?? null;
  const { data: status, isLoading } = useDailyCheckinStatus(!!currentUser);
  const claimMutation = useClaimDailyCheckin();

  const { claimAndNotify } = useCheckinAfterAuth({
    source: 'popup_checkin_dialog',
  });

  const { isLoading: isGoogleLoading, openGooglePopup } = usePopupOAuth({
    onSuccess: claimAndNotify,
    refetchSession,
  });

  useEffect(() => {
    if (isOpen) {
      trackEvent('daily_checkin_viewed', { isLoggedIn: !!currentUser });
    }
  }, [isOpen, currentUser]);

  const rewards = status?.rewards ?? [...CHECKIN_REWARDS];
  const checkedDays = status?.checkedDays ?? [];
  const currentDay = status?.currentDay ?? 1;
  const isCompleted = status?.isCompleted ?? false;
  const hasCheckedInToday = status?.hasCheckedInToday ?? false;
  const resetAt = status?.resetAt;

  const earnedCredits = useMemo(
    () => checkedDays.reduce((sum, day) => sum + (rewards[day - 1] ?? 0), 0),
    [checkedDays, rewards]
  );

  // Countdown timer to next check-in reset
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    if (!resetAt || !hasCheckedInToday) {
      setCountdown('');
      return;
    }
    const target = new Date(resetAt).getTime();

    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      if (diff <= 0) {
        setCountdown('00:00:00');
        return;
      }
      const h = String(Math.floor(diff / 3_600_000)).padStart(2, '0');
      const m = String(Math.floor((diff % 3_600_000) / 60_000)).padStart(
        2,
        '0'
      );
      const s = String(Math.floor((diff % 60_000) / 1_000)).padStart(2, '0');
      setCountdown(`${h}:${m}:${s}`);
    };

    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [resetAt, hasCheckedInToday]);

  const renderCta = () => {
    if (!currentUser) {
      return (
        <Button
          type="button"
          className={GRADIENT_CTA}
          onClick={openGooglePopup}
          disabled={isGoogleLoading}
        >
          {isGoogleLoading ? t('cta.claiming') : t('cta.signInAndClaim')}
        </Button>
      );
    }

    if (isCompleted) {
      return (
        <Button
          type="button"
          className="w-full h-11 sm:h-10 text-base sm:text-lg font-bold rounded-2xl border-0 bg-white/10 text-white/50 cursor-default"
          disabled
        >
          {t('cta.completed')}
        </Button>
      );
    }

    if (hasCheckedInToday) {
      return (
        <div className="flex items-center justify-center gap-2 w-full h-12 sm:h-14 rounded-xl bg-muted/50 text-muted-foreground text-base">
          <ClockIcon className="h-4 w-4" />
          <span>{t('cta.nextCheckin')}</span>
          {countdown && (
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {countdown}
            </span>
          )}
        </div>
      );
    }

    return (
      <Button
        type="button"
        className={GRADIENT_CTA}
        onClick={() => claimMutation.mutate()}
        disabled={claimMutation.isPending}
      >
        {claimMutation.isPending ? t('cta.claiming') : t('cta.claim')}
      </Button>
    );
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        // Prevent closing while OAuth is in progress
        if (!open && isGoogleLoading) return;
        if (!open) closeDialog();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="!w-[calc(100vw-1rem)] !max-w-[calc(100vw-1rem)] overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(30,41,59,0.96)_0%,rgba(17,24,39,0.98)_100%)] px-3 py-3 shadow-[0_24px_80px_rgba(15,23,42,0.45)] sm:!w-[672px] sm:!max-w-[672px] sm:grid-rows-[auto_minmax(0,1fr)] sm:px-5 sm:py-4"
        style={{
          width: 'calc(100vw - 1rem)',
          maxWidth: 'calc(100vw - 1rem)',
        }}
      >
        <Image
          src="/svg/flower.png"
          alt=""
          width={160}
          height={160}
          className="pointer-events-none absolute top-1 -left-4 z-0 h-24 w-auto -rotate-12 opacity-90 sm:top-0 sm:-left-4 sm:h-32"
          aria-hidden="true"
        />

        <DialogClose
          className="absolute top-4 right-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/6 bg-white/10 text-white/85 backdrop-blur-sm transition-all hover:bg-white/16 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none disabled:pointer-events-none"
          disabled={isGoogleLoading}
        >
          <XIcon className="h-5 w-5 text-white/55" strokeWidth={2.25} />
          <span className="sr-only">Close</span>
        </DialogClose>

        <DialogHeader className="relative z-10 space-y-1.5 pt-8 sm:space-y-2 sm:pt-10">
          {/* Title with highlighted number */}
          <DialogTitle className="px-6 text-center text-lg leading-[1.05] font-bold break-words text-balance text-white sm:px-10 sm:text-[1.72rem]">
            {currentUser
              ? t('titleLoggedIn')
              : t.rich('title', {
                  credits: (chunks) => (
                    <span className="bg-gradient-to-r from-yellow-300 via-amber-300 to-orange-400 bg-clip-text text-transparent">
                      {chunks}
                    </span>
                  ),
                })}
          </DialogTitle>

          {/* Subtitle */}
          <p className="px-6 text-center text-sm leading-snug text-white/78 text-balance sm:px-16 sm:text-[0.96rem]">
            {currentUser
              ? t.rich('subtitleLoggedIn', {
                  credits: (chunks) => (
                    <span className="font-semibold text-amber-300">
                      {chunks}
                    </span>
                  ),
                })
              : t.rich('subtitle2', {
                  credits: (chunks) => (
                    <span className="font-semibold text-amber-300">
                      {chunks}
                    </span>
                  ),
                })}
          </p>

          {/* Model tags — compact supporting strip */}
          <div className="mx-auto grid w-full max-w-[25rem] grid-cols-1 gap-1 rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-2 sm:gap-y-1 sm:px-3.5 sm:py-2">
            <div className="flex items-center gap-2">
              <FilmIcon className="h-3 w-3 text-white/55" />
              <span className="text-xs text-white/60">~5 videos</span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="h-5 border-0 bg-amber-400/12 px-1.5 py-0 text-[9px] text-amber-100"
              >
                Wan
              </Badge>
              <Badge
                variant="secondary"
                className="h-5 border-0 bg-amber-400/12 px-1.5 py-0 text-[9px] text-amber-100"
              >
                Sora2
              </Badge>
              <Badge
                variant="secondary"
                className="h-5 border-0 bg-amber-400/12 px-1.5 py-0 text-[9px] text-amber-100"
              >
                Veo3
              </Badge>
              <Badge
                variant="secondary"
                className="h-5 border-0 bg-amber-400/12 px-1.5 py-0 text-[9px] text-amber-100"
              >
                Wan
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <ImageIcon className="h-3 w-3 text-white/55" />
              <span className="text-xs text-white/60">~15 images</span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="h-5 border-0 bg-white/8 px-1.5 py-0 text-[9px] text-white/82"
              >
                Nano Banana
              </Badge>
              <Badge
                variant="secondary"
                className="h-5 border-0 bg-white/8 px-1.5 py-0 text-[9px] text-white/82"
              >
                Seedream
              </Badge>
              <Badge
                variant="secondary"
                className="h-5 border-0 bg-white/8 px-1.5 py-0 text-[9px] text-white/82"
              >
                Z-Image
              </Badge>
            </div>
          </div>

          {/* Daily rewards */}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <span className="text-xs text-white/65 sm:text-sm">
              {t('dailyRewardsLabel')}
            </span>
            <Badge
              variant="outline"
              className="border-amber-300/30 bg-amber-300/12 px-2.5 py-0.5 text-xs text-amber-100"
            >
              {t('dailyRewardsBadge')}
            </Badge>
          </div>
        </DialogHeader>

        <div className="relative z-10 min-w-0 space-y-3 pt-4 sm:flex sm:flex-1 sm:flex-col sm:justify-between sm:pt-5">
          {/* Check-in summary — shown when user has checked in at least once */}
          {currentUser && checkedDays.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-sm text-white/60">{t('summaryLabel')}</span>
              <Badge
                variant="outline"
                className="border-amber-300/30 bg-amber-300/12 px-2.5 py-0.5 text-xs text-amber-100"
              >
                {t('summaryDays', { days: checkedDays.length })}
              </Badge>
              <Badge
                variant="outline"
                className="border-white/12 bg-white/[0.04] px-2.5 py-0.5 text-xs text-white/82"
              >
                {t('summaryEarned', { credits: earnedCredits })}
              </Badge>
            </div>
          )}

          <div className="px-1 py-1 sm:px-0 sm:py-0">
            <CheckinRewardGrid
              rewards={rewards}
              currentDay={currentDay}
              checkedDays={checkedDays}
              isCompleted={isCompleted}
            />
          </div>

          {isLoading && currentUser ? (
            <Button type="button" className={GRADIENT_CTA} disabled>
              {t('cta.claiming')}
            </Button>
          ) : (
            renderCta()
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
