'use client';

import { LoginWrapper } from '@/components/auth/login-wrapper';
import { UpgradeDialog } from '@/components/pricing/upgrade-dialog';
import { useCurrentPlan } from '@/hooks/use-payment';
import { authClient } from '@/lib/auth-client';
import { Routes } from '@/routes';
import { Crown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Sidebar upgrade button that shows for free users.
 * Opens the unified UpgradeDialog when clicked (or login modal if not logged in).
 */
export function SidebarUpgradeButton() {
  const t = useTranslations('Dashboard');
  const { data: session } = authClient.useSession();
  const { data: paymentData, isLoading } = useCurrentPlan(session?.user?.id);
  const [open, setOpen] = useState(false);

  const isLoggedIn = !!session?.user;
  const isMember = paymentData?.currentPlan && !paymentData.currentPlan.isFree;

  // Don't show for members or while loading
  if (isLoading || isMember) {
    return null;
  }

  const buttonContent = (
    <button
      type="button"
      onClick={isLoggedIn ? () => setOpen(true) : undefined}
      title={t('upgradeNow')}
      aria-label={t('upgradeNow')}
      className="relative overflow-hidden flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 hover:shadow-md active:scale-[0.98] group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:self-center"
      style={{
        background: 'linear-gradient(135deg, #B9FF58, #06b6d4, #8b5cf6)',
      }}
    >
      {/* Frosted noise overlay */}
      <div
        className="absolute inset-0 opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <Crown className="relative size-4 shrink-0 fill-white" />
      <span className="relative group-data-[collapsible=icon]:hidden">
        {t('upgradeNow')}
      </span>
    </button>
  );

  if (!isLoggedIn) {
    return (
      <LoginWrapper mode="modal" asChild callbackUrl={Routes.Pricing}>
        {buttonContent}
      </LoginWrapper>
    );
  }

  return (
    <>
      {buttonContent}
      <UpgradeDialog open={open} onOpenChange={setOpen} trigger="sidebar" />
    </>
  );
}
