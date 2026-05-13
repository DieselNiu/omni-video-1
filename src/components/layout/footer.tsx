'use client';

import Container from '@/components/layout/container';
import { Logo } from '@/components/layout/logo';
import { ModeSwitcherHorizontal } from '@/components/layout/mode-switcher-horizontal';
import { useFooterLinks } from '@/config/footer-config';
import { LocaleLink, useLocalePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import type React from 'react';

export function Footer({ className }: React.HTMLAttributes<HTMLElement>) {
  const t = useTranslations();
  const pathname = useLocalePathname();
  const footerLinks = useFooterLinks({ includeFriends: pathname === '/' });

  return (
    <footer className={cn('border-t', className)}>
      <Container className="px-4">
        <div className="flex flex-col gap-10 py-12 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <div className="space-y-4">
              <div className="items-center space-x-2 flex">
                <Logo />
                <span className="text-xl font-semibold">
                  {t('Metadata.name')}
                </span>
              </div>

              <p className="text-muted-foreground text-base py-2 md:pr-12">
                {t('Marketing.footer.tagline')}
              </p>
            </div>
          </div>

          {footerLinks.map((section) => (
            <div key={section.title} className="min-w-[12rem]">
              <span className="text-sm font-semibold uppercase">
                {section.title}
              </span>
              <ul className="mt-4 list-inside space-y-3">
                {section.items?.map((item) => {
                  if (!item.href) return null;
                  const isMailto = item.href.startsWith('mailto:');
                  const className =
                    'text-sm text-muted-foreground hover:text-primary';
                  return (
                    <li key={item.title}>
                      {isMailto ? (
                        <a href={item.href} className={className}>
                          {item.title}
                        </a>
                      ) : (
                        <LocaleLink
                          href={item.href}
                          target={item.external ? '_blank' : undefined}
                          className={className}
                        >
                          {item.title}
                        </LocaleLink>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Container>

      <div className="border-t py-6">
        <Container className="px-4 flex flex-wrap items-center justify-between gap-4">
          <span className="text-muted-foreground text-sm">
            &copy; {new Date().getFullYear()} {t('Metadata.name')} All Rights
            Reserved.
          </span>

          <ModeSwitcherHorizontal />
        </Container>
      </div>
    </footer>
  );
}
