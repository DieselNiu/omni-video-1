'use client';

import { websiteConfig } from '@/config/website';
import { useAutoCheckinAfterLogin } from '@/hooks/use-auto-checkin-after-login';
import { LOCALES } from '@/i18n/routing';
import { Routes } from '@/routes';
import { useDailyCheckinDialogStore } from '@/stores/daily-checkin-dialog-store';
import { useInsufficientCreditsDialogStore } from '@/stores/insufficient-credits-dialog-store';
import { useSubscriptionRequiredDialogStore } from '@/stores/subscription-required-dialog-store';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const GOOGLE_ONE_TAP_DISABLED_PREFIXES = [
  '/settings',
  '/admin',
  Routes.Payment,
];

function isGoogleOneTapEligiblePath(pathname: string) {
  const normalizedPathname = stripLocalePrefix(pathname);

  return !GOOGLE_ONE_TAP_DISABLED_PREFIXES.some(
    (prefix) =>
      normalizedPathname === prefix ||
      normalizedPathname.startsWith(`${prefix}/`)
  );
}

function stripLocalePrefix(pathname: string) {
  for (const locale of LOCALES) {
    const localePrefix = `/${locale}`;

    if (pathname === localePrefix) {
      return '/';
    }

    if (pathname.startsWith(`${localePrefix}/`)) {
      return pathname.slice(localePrefix.length);
    }
  }

  return pathname;
}

const InsufficientCreditsDialog = dynamic(
  () =>
    import('@/components/pricing/insufficient-credits-dialog').then((mod) => ({
      default: mod.InsufficientCreditsDialog,
    })),
  { ssr: false }
);

const SubscriptionRequiredDialog = dynamic(
  () =>
    import('@/components/pricing/subscription-required-dialog').then((mod) => ({
      default: mod.SubscriptionRequiredDialog,
    })),
  { ssr: false }
);

const DailyCheckinDialog = websiteConfig.features.enableDailyCheckin
  ? dynamic(
      () =>
        import('@/components/checkin/daily-checkin-dialog').then((mod) => ({
          default: mod.DailyCheckinDialog,
        })),
      { ssr: false }
    )
  : () => null;

const GoogleOneTap = (websiteConfig.auth as Record<string, unknown>)
  .enableGoogleOneTap
  ? dynamic(
      () =>
        import('@/components/auth/google-one-tap').then((mod) => ({
          default: mod.GoogleOneTap,
        })),
      { ssr: false }
    )
  : () => null;

export function GlobalDialogs({
  initialHasSession = false,
}: {
  initialHasSession?: boolean;
}) {
  const pathname = usePathname();
  const isInsufficientCreditsDialogOpen = useInsufficientCreditsDialogStore(
    (state) => state.isOpen
  );
  const isSubscriptionRequiredDialogOpen = useSubscriptionRequiredDialogStore(
    (state) => state.isOpen
  );
  const isDailyCheckinDialogOpen = useDailyCheckinDialogStore(
    (state) => state.isOpen
  );

  useAutoCheckinAfterLogin();

  const shouldShowGoogleOneTap =
    !initialHasSession && isGoogleOneTapEligiblePath(pathname);

  return (
    <>
      {isInsufficientCreditsDialogOpen ? <InsufficientCreditsDialog /> : null}
      {isSubscriptionRequiredDialogOpen ? <SubscriptionRequiredDialog /> : null}
      {isDailyCheckinDialogOpen ? <DailyCheckinDialog /> : null}
      {shouldShowGoogleOneTap ? <GoogleOneTap /> : null}
    </>
  );
}
