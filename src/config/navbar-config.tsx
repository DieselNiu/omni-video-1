'use client';

import { websiteConfig } from '@/config/website';
import { Routes } from '@/routes';
import type { NestedMenuItem } from '@/types';
import { useTranslations } from 'next-intl';

/**
 * Get navbar config with translations
 */
export function useNavbarLinks(): NestedMenuItem[] {
  const t = useTranslations('Marketing.navbar');
  return [
    {
      title: t('generate.title'),
      href: '/#hero',
      external: false,
    },
    {
      title: t('pricing.title'),
      href: Routes.Pricing,
      external: false,
    },
    ...(websiteConfig.blog.enable
      ? [
          {
            title: t('blog.title'),
            href: Routes.Blog,
            external: false,
          },
        ]
      : []),
  ];
}
