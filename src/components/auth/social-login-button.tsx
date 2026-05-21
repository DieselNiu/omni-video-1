'use client';

import { DividerWithText } from '@/components/auth/divider-with-text';
import { GitHubIcon } from '@/components/icons/github';
import { GoogleIcon } from '@/components/icons/google';
import { YandexIcon } from '@/components/icons/yandex';
import { Button } from '@/components/ui/button';
import { websiteConfig } from '@/config/website';
import { usePopupOAuth } from '@/hooks/use-popup-oauth';
import { authClient } from '@/lib/auth-client';
import { Routes } from '@/routes';
import { Loader2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface SocialLoginButtonProps {
  callbackUrl?: string;
  showDivider?: boolean;
}

/**
 * social login buttons
 */
export const SocialLoginButton = ({
  showDivider = true,
}: SocialLoginButtonProps) => {
  if (
    !websiteConfig.auth.enableGoogleLogin &&
    !websiteConfig.auth.enableGithubLogin &&
    !websiteConfig.auth.enableYandexLogin
  ) {
    return null;
  }

  const t = useTranslations('AuthPage.login');
  const { refetch } = authClient.useSession();
  const { loadingProvider, openGooglePopup, openYandexPopup } = usePopupOAuth({
    refetchSession: refetch,
    onSuccess: () => {
      // Popup flow completes in the same tab — let the session refresh
      // propagate; downstream UI will react.
    },
  });
  const [isGithubLoading, setIsGithubLoading] = useState(false);

  const onGithubClick = async () => {
    await authClient.signIn.social(
      {
        provider: 'github',
        callbackURL: '/',
        errorCallbackURL: Routes.AuthError,
      },
      {
        onRequest: () => setIsGithubLoading(true),
        onResponse: () => setIsGithubLoading(false),
        onError: () => setIsGithubLoading(false),
      }
    );
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {showDivider && <DividerWithText text={t('or')} />}
      {websiteConfig.auth.enableGoogleLogin && (
        <Button
          size="lg"
          className="w-full cursor-pointer"
          variant="outline"
          onClick={openGooglePopup}
          disabled={loadingProvider === 'google'}
        >
          {loadingProvider === 'google' ? (
            <Loader2Icon className="mr-2 size-4 animate-spin" />
          ) : (
            <GoogleIcon className="size-4 mr-2" />
          )}
          <span>{t('signInWithGoogle')}</span>
        </Button>
      )}
      {websiteConfig.auth.enableGithubLogin && (
        <Button
          size="lg"
          className="w-full cursor-pointer"
          variant="outline"
          onClick={onGithubClick}
          disabled={isGithubLoading}
        >
          {isGithubLoading ? (
            <Loader2Icon className="mr-2 size-4 animate-spin" />
          ) : (
            <GitHubIcon className="size-4 mr-2" />
          )}
          <span>{t('signInWithGitHub')}</span>
        </Button>
      )}
      {websiteConfig.auth.enableYandexLogin && (
        <Button
          size="lg"
          className="w-full cursor-pointer"
          variant="outline"
          onClick={openYandexPopup}
          disabled={loadingProvider === 'yandex'}
        >
          {loadingProvider === 'yandex' ? (
            <Loader2Icon className="mr-2 size-4 animate-spin" />
          ) : (
            <YandexIcon className="size-4 mr-2" />
          )}
          <span>{t('signInWithYandex')}</span>
        </Button>
      )}
    </div>
  );
};
