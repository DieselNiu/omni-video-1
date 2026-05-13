'use client';

import { Routes } from '@/routes';
import type { NestedMenuItem } from '@/types';
import { useTranslations } from 'next-intl';

/**
 * Get footer config with translations
 *
 * NOTICE: used in client components only
 *
 * docs:
 * https://mksaas.com/docs/config/footer
 *
 * @returns The footer config with translated titles
 */
export function useFooterLinks(
  options: { includeFriends?: boolean } = {}
): NestedMenuItem[] {
  const tFooter = useTranslations('Marketing.footer');
  const tNavbar = useTranslations('Marketing.navbar');

  const productItems: NestedMenuItem['items'] = [
    {
      title: tNavbar('generate.title'),
      href: '/#hero',
      external: false,
    },
    {
      title: tNavbar('pricing.title'),
      href: Routes.Pricing,
      external: false,
    },
  ];

  const friendsSection: NestedMenuItem = {
    title: tFooter('friends.title'),
    items: [
      {
        title: tFooter('friends.items.friend'),
        href: '/friend',
        external: false,
      },
    ],
  };

  return [
    {
      title: tFooter('product.title'),
      items: productItems,
    },
    {
      title: tFooter('legal.title'),
      items: [
        {
          title: tFooter('legal.items.cookiePolicy'),
          href: Routes.CookiePolicy,
          external: false,
        },
        {
          title: tFooter('legal.items.privacyPolicy'),
          href: Routes.PrivacyPolicy,
          external: false,
        },
        {
          title: tFooter('legal.items.termsOfService'),
          href: Routes.TermsOfService,
          external: false,
        },
        {
          title: tFooter('legal.items.contactUs'),
          href: 'mailto:hello@geminiomni.video',
          external: false,
        },
      ],
    },
    ...(options.includeFriends ? [friendsSection] : []),
  ];
}
