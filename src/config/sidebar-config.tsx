'use client';

import { Routes } from '@/routes';
import type { NestedMenuItem } from '@/types';
import {
  CircleUserRoundIcon,
  CoinsIcon,
  CreditCardIcon,
  FolderOpen,
  KeyIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { websiteConfig } from './website';

/**
 * Get sidebar config with translations
 *
 * NOTICE: used in client components only
 *
 * docs:
 * https://mksaas.com/docs/config/sidebar
 *
 * @returns The sidebar config with translated titles and descriptions
 */
export function useSidebarLinks(): NestedMenuItem[] {
  const t = useTranslations('Dashboard');

  return [
    {
      title: t('assets.title'),
      icon: <FolderOpen className="size-4 shrink-0" />,
      href: Routes.Assets,
      external: false,
    },
    ...(websiteConfig.credits.enableCredits
      ? [
          {
            title: t('settings.credits.title'),
            icon: <CoinsIcon className="size-4 shrink-0" />,
            href: Routes.SettingsCredits,
            external: false,
          },
        ]
      : []),
    {
      title: t('settings.api.title'),
      icon: <KeyIcon className="size-4 shrink-0" />,
      href: Routes.SettingsApi,
      external: false,
    },
    {
      title: t('settings.billing.title'),
      icon: <CreditCardIcon className="size-4 shrink-0" />,
      href: Routes.SettingsBilling,
      external: false,
    },
    {
      title: t('settings.profile.title'),
      icon: <CircleUserRoundIcon className="size-4 shrink-0" />,
      href: Routes.SettingsProfile,
      external: false,
    },
  ];
}
