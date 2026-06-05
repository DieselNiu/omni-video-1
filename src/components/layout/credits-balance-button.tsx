'use client';

import { LoginDialog } from '@/components/auth/login-dialog';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { websiteConfig } from '@/config/website';
import { useCreditBalance } from '@/hooks/use-credits';
import { useDailyCheckinStatus } from '@/hooks/use-daily-checkin';
import { useCurrentPlan } from '@/hooks/use-payment';
import { useSignOut } from '@/hooks/use-sign-out';
import { authClient } from '@/lib/auth-client';
import { Routes } from '@/routes';
import { useDailyCheckinDialogStore } from '@/stores/daily-checkin-dialog-store';
import { useInsufficientCreditsDialogStore } from '@/stores/insufficient-credits-dialog-store';
import {
  CoinsIcon,
  GiftIcon,
  Loader2Icon,
  LogOutIcon,
  MessageCircleQuestionIcon,
  PlusIcon,
  SendIcon,
  UserIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface CreditsBalanceButtonProps {
  showPromo?: boolean;
}

export function CreditsBalanceButton({
  showPromo = false,
}: CreditsBalanceButtonProps) {
  if (!websiteConfig.credits.enableCredits) {
    return null;
  }

  const t = useTranslations();
  const tp = useTranslations('Marketing.navbar.creditsPopover');
  const { data: session } = authClient.useSession();
  const isLoggedIn = !!session?.user;
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const { openDialog: openCreditsDialog } = useInsufficientCreditsDialogStore();

  const { data: rawBalance = 0, isLoading } = useCreditBalance();
  const balance = isLoggedIn ? rawBalance : 0;
  const showLoading = isLoggedIn && isLoading;

  const { data: checkinStatus } = useDailyCheckinStatus(isLoggedIn);
  const { data: paymentData } = useCurrentPlan(session?.user?.id);
  const isPaidUser =
    isLoggedIn && !!paymentData?.currentPlan && !paymentData.currentPlan.isFree;
  const { openDialog } = useDailyCheckinDialogStore();

  const nextReward = checkinStatus?.nextRewardCredits ?? 3;
  const hasCheckedInToday = checkinStatus?.hasCheckedInToday ?? false;

  const handleGetMore = () => {
    if (isLoggedIn) {
      openCreditsDialog({ currentCredits: balance, requiredCredits: 0 });
    } else {
      setLoginOpen(true);
    }
    setOpen(false);
  };

  const handleCheckin = () => {
    if (isLoggedIn) {
      openDialog();
    } else {
      setLoginOpen(true);
    }
    setOpen(false);
  };

  const handleSignOut = () => {
    setOpen(false);
    signOut();
  };

  const checkinEnabled = websiteConfig.features.enableDailyCheckin;

  const promoBadge =
    showPromo && !isPaidUser && checkinEnabled ? (
      <button
        type="button"
        onClick={openDialog}
        className="flex items-center gap-2 rounded-full p-1.5 sm:px-3 sm:py-1 text-xs font-semibold text-white shadow-sm cursor-pointer hover:opacity-90 transition-opacity whitespace-nowrap"
        style={{
          background: 'linear-gradient(135deg, #B9FF58, #06b6d4, #8b5cf6)',
        }}
      >
        <GiftIcon className="h-3.5 w-3.5 shrink-0 animate-wiggle" />
        <span className="hidden sm:inline">
          {t('Marketing.navbar.creditsPromo')}
        </span>
      </button>
    ) : null;

  return (
    <>
      <div className="flex items-center gap-2">
        {promoBadge}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-sm font-medium cursor-pointer"
            >
              <CoinsIcon className="h-3.5 w-3.5" />
              <span>
                {showLoading ? (
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  balance.toLocaleString()
                )}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-72 rounded-lg p-0 shadow-lg"
          >
            {/* Balance section */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <CoinsIcon className="h-5 w-5 shrink-0" />
              <div className="flex-1">
                <div className="text-2xl font-bold tabular-nums">
                  {balance.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  {isLoggedIn ? tp('availableCredits') : tp('freeCredits')}
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Sign in hint (not logged in) */}
            {!isLoggedIn && (
              <>
                <div className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginOpen(true);
                      setOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-md bg-muted/50 px-3 py-2.5 text-left transition-colors hover:bg-muted"
                  >
                    <UserIcon className="h-4 w-4 shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {tp('signInHint')}
                    </p>
                  </button>
                </div>
                <div className="h-px bg-border" />
              </>
            )}

            {/* Actions */}
            <div className="p-2 space-y-0.5">
              {/* Contact Us */}
              <a
                href="mailto:support@gemini-omni.video"
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs transition-colors hover:bg-accent whitespace-nowrap"
              >
                <MessageCircleQuestionIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left">
                  {tp('contactQuestion')}{' '}
                  <span className="font-medium underline underline-offset-2">
                    {tp('contactUs')}
                  </span>
                </span>
              </a>

              {/* Check In */}
              {checkinEnabled && (
                <button
                  type="button"
                  onClick={handleCheckin}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent cursor-pointer"
                >
                  <GiftIcon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">
                    {isLoggedIn && hasCheckedInToday
                      ? tp('checkedIn')
                      : tp('checkIn', {
                          credits: isLoggedIn ? nextReward : 30,
                        })}
                  </span>
                </button>
              )}

              {/* Join Telegram */}
              <a
                href="https://t.me/+v7TKo5yeXpRiMzll"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
              >
                <SendIcon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{tp('joinTelegram')}</span>
              </a>

              {/* Get More */}
              <button
                type="button"
                onClick={handleGetMore}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent cursor-pointer"
              >
                <PlusIcon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{tp('getMore')}</span>
              </button>

              {/* Sign Out (logged in only) */}
              {isLoggedIn && (
                <>
                  <div className="h-px bg-border mx-1 my-1" />
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent cursor-pointer"
                  >
                    <LogOutIcon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">
                      {t('Common.logout')}
                    </span>
                  </button>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Login dialog for unauthenticated users */}
      {!isLoggedIn && (
        <LoginDialog
          open={loginOpen}
          onOpenChange={setLoginOpen}
          callbackUrl={Routes.Root}
        />
      )}
    </>
  );
}
