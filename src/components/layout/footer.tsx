'use client';

import Container from '@/components/layout/container';
import { Logo } from '@/components/layout/logo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFooterLinks } from '@/config/footer-config';
import { websiteConfig } from '@/config/website';
import { LocaleLink } from '@/i18n/navigation';
import { useLocalePathname, useLocaleRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useLocaleStore } from '@/stores/locale-store';
import { type Locale, useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import type React from 'react';
import { useEffect, useTransition } from 'react';

export function Footer({ className }: React.HTMLAttributes<HTMLElement>) {
  const t = useTranslations();
  const footerLinks = useFooterLinks();

  return (
    <footer className={cn('bg-[#060606] text-white', className)}>
      <Container className="max-w-none px-6 sm:px-10 lg:px-20 xl:px-[86px]">
        <div className="grid gap-12 pt-16 pb-14 sm:grid-cols-2 lg:ml-[10vw] lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] lg:gap-x-24 lg:pt-[94px] lg:pb-[68px]">
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h2 className="text-[22px] font-semibold leading-none tracking-normal text-white">
                {section.title}
              </h2>
              <ul className="mt-10 space-y-[26px]">
                {section.items?.map((item) => {
                  if (!item.href) return null;
                  const isMailto = item.href.startsWith('mailto:');
                  const className =
                    'block text-[21px] font-medium leading-[1.25] tracking-normal text-[#8d8d8d] transition-colors hover:text-white';
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

      <Container className="max-w-none px-6 sm:px-10 lg:px-20 xl:px-[86px]">
        <div className="pb-[58px]">
          <LocaleLink href="/" className="inline-flex items-center gap-3">
            <Logo className="size-10 rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.08)]" />
            <span className="text-2xl font-bold leading-none text-white">
              {t('Metadata.name')}
            </span>
          </LocaleLink>
        </div>

        <div className="border-t border-white/10 py-[62px]">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <span className="text-[21px] font-medium leading-none text-[#8d8d8d]">
              &copy; {new Date().getFullYear()} {t('Metadata.name')} All Rights
              Reserved.
            </span>

            <FooterLocaleSwitcher />
          </div>
        </div>
      </Container>
    </footer>
  );
}

function FooterLocaleSwitcher() {
  const router = useLocaleRouter();
  const pathname = useLocalePathname();
  const params = useParams();
  const locale = useLocale();
  const { currentLocale, setCurrentLocale } = useLocaleStore();
  const [, startTransition] = useTransition();

  useEffect(() => {
    setCurrentLocale(locale);
  }, [locale, setCurrentLocale]);

  const showLocaleSwitch = Object.keys(websiteConfig.i18n.locales).length > 1;
  if (!showLocaleSwitch) {
    return null;
  }

  const activeLocale = currentLocale || locale;
  const activeLocaleName = websiteConfig.i18n.locales[activeLocale].name;

  const setLocale = (nextLocale: Locale) => {
    setCurrentLocale(nextLocale);

    startTransition(() => {
      router.replace(
        // @ts-expect-error -- params always describe the current route.
        { pathname, params },
        { locale: nextLocale }
      );
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-2 text-[21px] font-semibold leading-none text-white transition-colors hover:text-[#d8d8d8]"
          aria-label="Switch language"
        >
          <FooterGlobeIcon />
          <span>{activeLocaleName}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        className="border-white/10 bg-[#111] text-white"
      >
        {Object.entries(websiteConfig.i18n.locales).map(
          ([localeOption, data]) => (
            <DropdownMenuItem
              key={localeOption}
              onClick={() => setLocale(localeOption)}
              className="cursor-pointer focus:bg-white/10 focus:text-white"
            >
              {data.flag && <span className="text-md">{data.flag}</span>}
              <span>{data.name}</span>
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FooterGlobeIcon() {
  return (
    <svg
      className="size-[22px] shrink-0"
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="11" cy="11" r="8.25" stroke="currentColor" strokeWidth="2" />
      <path
        d="M2.75 11h16.5M11 2.75c2.2 2.24 3.33 5 3.33 8.25S13.2 17.01 11 19.25C8.8 17.01 7.67 14.25 7.67 11S8.8 4.99 11 2.75Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
