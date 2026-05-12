'use client';

import { Routes } from '@/routes';
import type { MenuItem } from '@/types';
import {
  CircleUserRoundIcon,
  CoinsIcon,
  CreditCardIcon,
  FolderOpen,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Get avatar config with translations
 *
 * NOTICE: used in client components only
 *
 * docs:
 * https://mksaas.com/docs/config/avatar
 *
 * @returns The avatar config with translated titles
 */
export function useAvatarLinks(): MenuItem[] {
  const t = useTranslations('Marketing.avatar');

  return [
    {
      title: t('assets'),
      href: Routes.Assets,
      icon: <FolderOpen className="size-4 shrink-0" />,
    },
    {
      title: t('credits'),
      href: Routes.SettingsCredits,
      icon: <CoinsIcon className="size-4 shrink-0" />,
    },
    {
      title: t('billing'),
      href: Routes.SettingsBilling,
      icon: <CreditCardIcon className="size-4 shrink-0" />,
    },
    {
      title: t('settings'),
      href: Routes.SettingsProfile,
      icon: <CircleUserRoundIcon className="size-4 shrink-0" />,
    },
  ];
}
