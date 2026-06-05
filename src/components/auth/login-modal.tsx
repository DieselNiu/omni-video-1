'use client';

import { GoogleIcon } from '@/components/icons/google';
import { YandexIcon } from '@/components/icons/yandex';
import { FormError } from '@/components/shared/form-error';
import { Button } from '@/components/ui/button';
import { websiteConfig } from '@/config/website';
import { usePopupOAuth } from '@/hooks/use-popup-oauth';
import { LocaleLink } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { Routes } from '@/routes';
import type { HomeLoginReason } from '@/stores/home-image-store';
import { Info, Loader2Icon, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { useState } from 'react';

export interface LoginModalProps {
  callbackUrl?: string;
  reason?: HomeLoginReason;
  onSuccess?: () => void | Promise<void>;
  onCancel?: () => void;
  onUpgrade?: () => void;
  onRequestLogin?: () => void;
}

export const LoginModal = ({
  reason = 'default',
  onSuccess,
  onCancel,
  onUpgrade,
}: LoginModalProps) => {
  const t = useTranslations('AuthPage.loginModal');
  const quotaT = useTranslations('HomeQuota.loginModal');
  const searchParams = useSearchParams();
  const urlError = searchParams.get('error');

  const [error, setError] = useState<string | undefined>('');
  const { refetch } = authClient.useSession();
  const { loadingProvider, openGooglePopup, openYandexPopup } = usePopupOAuth({
    refetchSession: refetch,
    onSuccess: async () => {
      await onSuccess?.();
    },
    onError: () => setError('Login failed. Please try again.'),
  });
  const isGoogleLoading = loadingProvider === 'google';
  const isYandexLoading = loadingProvider === 'yandex';

  const content = useMemo(() => {
    if (reason === 'anon_exhausted') {
      return {
        title: quotaT('reasonAnonExhausted.title'),
        description: quotaT('reasonAnonExhausted.body'),
        cta: quotaT('reasonAnonExhausted.ctaLogin'),
      };
    }

    if (reason === 'anon_linked') {
      return {
        title: quotaT('reasonAnonLinked.title'),
        description: quotaT('reasonAnonLinked.body'),
        cta: quotaT('reasonAnonLinked.ctaLogin'),
      };
    }

    if (reason === 'feature_gated') {
      return {
        title: quotaT('reasonFeatureGated.title'),
        description: quotaT('reasonFeatureGated.body'),
        cta: quotaT('reasonFeatureGated.ctaLogin'),
      };
    }

    return {
      title: t('welcomeTitle'),
      description: t('welcomeSubtitle'),
      cta: t('continueWithGoogle'),
    };
  }, [quotaT, reason, t]);

  const onYandexLogin = openYandexPopup;
  const onGoogleLogin = openGooglePopup;

  if (reason === 'anon_exhausted') {
    return (
      <div className="bg-background">
        <div className="border-b px-6 py-5 sm:px-8">
          <h1 className="text-left text-lg font-semibold text-foreground">
            {quotaT('reasonAnonExhausted.modalTitle')}
          </h1>
        </div>

        <div className="space-y-5 px-6 py-7 sm:px-8">
          <FormError message={error || urlError || undefined} />

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                <Sparkles className="size-3" />
                {quotaT('reasonAnonExhausted.heroLabel')}
              </span>
            </div>
            <h2 className="text-2xl font-semibold leading-tight text-foreground">
              {quotaT('reasonAnonExhausted.title')}
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {quotaT('reasonAnonExhausted.body')}
            </p>

            {websiteConfig.auth.enableGoogleLogin && (
              <Button
                size="lg"
                variant="outline"
                className="h-11 w-full rounded-xl text-sm font-medium"
                onClick={onGoogleLogin}
                disabled={isGoogleLoading}
              >
                {isGoogleLoading ? (
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                ) : (
                  <GoogleIcon className="mr-2 size-4" />
                )}
                <span>{quotaT('reasonAnonExhausted.ctaLogin')}</span>
              </Button>
            )}
            {websiteConfig.auth.enableYandexLogin && (
              <Button
                size="lg"
                variant="outline"
                className="h-11 w-full rounded-xl text-sm font-medium"
                onClick={onYandexLogin}
                disabled={isYandexLoading}
              >
                {isYandexLoading ? (
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                ) : (
                  <YandexIcon className="mr-2 size-4" />
                )}
                <span>{t('continueWithYandex')}</span>
              </Button>
            )}
          </div>

          <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3.5">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-5 text-muted-foreground">
              {quotaT('reasonAnonExhausted.info')}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end sm:px-8">
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {quotaT('reasonAnonExhausted.ctaCancel')}
            </Button>
          ) : null}
          {onUpgrade ? (
            <Button
              type="button"
              onClick={onUpgrade}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-700"
            >
              {quotaT('reasonAnonExhausted.ctaUpgrade')}
            </Button>
          ) : (
            <Button
              asChild
              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-700"
            >
              <LocaleLink href={Routes.Pricing}>
                {quotaT('reasonAnonExhausted.ctaUpgrade')}
              </LocaleLink>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-xl bg-white px-5 py-5">
      {/* Title */}
      <div className="text-center mb-4">
        <h1 className="text-lg font-bold text-gray-900 mb-0.5">
          {content.title}
        </h1>
        <p className="text-xs text-gray-500">{content.description}</p>
      </div>

      <FormError message={error || urlError || undefined} />

      {/* Google Login Button */}
      {websiteConfig.auth.enableGoogleLogin && (
        <Button
          size="default"
          className="w-full h-10 cursor-pointer !bg-white !text-gray-800 hover:!bg-gray-50 border border-gray-300 font-medium shadow-sm rounded-lg text-sm"
          onClick={onGoogleLogin}
          disabled={isGoogleLoading}
        >
          {isGoogleLoading ? (
            <Loader2Icon className="mr-2 size-4 animate-spin" />
          ) : (
            <GoogleIcon className="size-4 mr-2" />
          )}
          <span>{content.cta}</span>
        </Button>
      )}

      {/* Yandex Login Button */}
      {websiteConfig.auth.enableYandexLogin && (
        <Button
          size="default"
          className="mt-2 w-full h-10 cursor-pointer !bg-white !text-gray-800 hover:!bg-gray-50 border border-gray-300 font-medium shadow-sm rounded-lg text-sm"
          onClick={onYandexLogin}
          disabled={isYandexLoading}
        >
          {isYandexLoading ? (
            <Loader2Icon className="mr-2 size-4 animate-spin" />
          ) : (
            <YandexIcon className="size-4 mr-2" />
          )}
          <span>{t('continueWithYandex')}</span>
        </Button>
      )}

      {onCancel ? (
        <Button
          type="button"
          variant="ghost"
          className="mt-2 w-full text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          onClick={onCancel}
        >
          {reason === 'default'
            ? t('cancel')
            : reason === 'feature_gated'
              ? quotaT('reasonFeatureGated.ctaCancel')
              : reason === 'anon_linked'
                ? quotaT('reasonAnonLinked.ctaCancel')
                : quotaT('reasonAnonExhausted.ctaCancel')}
        </Button>
      ) : null}

      {/* Terms */}
      <p className="text-[11px] text-gray-400 text-center mt-3">
        {t('termsText')}{' '}
        <Link
          href="/terms"
          className="underline hover:text-gray-600"
          prefetch={false}
        >
          {t('termsOfService')}
        </Link>{' '}
        {t('and')}{' '}
        <Link
          href="/privacy"
          className="underline hover:text-gray-600"
          prefetch={false}
        >
          {t('privacyPolicy')}
        </Link>
        .
      </p>
    </div>
  );
};
