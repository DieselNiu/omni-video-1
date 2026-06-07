import { Analytics } from '@/analytics/analytics';
import GoogleAds from '@/analytics/google-ads';
import {
  fontBricolageGrotesque,
  fontMontserrat,
  fontNotoSans,
  fontNotoSansMono,
  fontNotoSerif,
} from '@/assets/fonts';
import AffonsoScript from '@/components/affiliate/affonso';
import PromotekitScript from '@/components/affiliate/promotekit';
import { routing } from '@/i18n/routing';
import { getSession } from '@/lib/server';
import { cn } from '@/lib/utils';
import { type Locale, NextIntlClientProvider, hasLocale } from 'next-intl';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { Providers } from './providers';

import '@/styles/globals.css';

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: Locale }>;
}

/**
 * 1. Locale Layout
 * https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing#layout
 *
 * 2. NextIntlClientProvider
 * https://next-intl.dev/docs/usage/configuration#nextintlclientprovider
 */
export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;
  const session = await getSession();
  const cookieStore = await cookies();
  const initialTheme = cookieStore.get('active_theme')?.value || 'default';

  // Ensure that the incoming `locale` is valid
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    <html suppressHydrationWarning lang={locale}>
      <head>
        <meta name="yandex-verification" content="c89365e7a87a7f4c" />
        <link
          rel="preconnect"
          href="https://assets.gemini-omni.video"
          crossOrigin=""
        />
        <link
          rel="preconnect"
          href="https://static.cloudflareinsights.com"
          crossOrigin=""
        />
        <link
          rel="preconnect"
          href="https://plausible.dieselniu.im"
          crossOrigin=""
        />
        <link
          rel="preload"
          as="image"
          href="https://assets.gemini-omni.video/landingpage/landing-hero-poster.jpg"
          fetchPriority="high"
        />
        <AffonsoScript />
        <PromotekitScript />
        <GoogleAds />
      </head>
      <body
        suppressHydrationWarning
        className={cn(
          'size-full antialiased',
          `theme-${initialTheme}`,
          fontMontserrat.className,
          fontNotoSans.variable,
          fontNotoSerif.variable,
          fontNotoSansMono.variable,
          fontMontserrat.variable,
          fontBricolageGrotesque.variable
        )}
      >
        <NuqsAdapter>
          <NextIntlClientProvider>
            <Providers
              locale={locale}
              initialHasSession={!!session?.user}
              initialTheme={initialTheme}
            >
              {children}

              <Toaster richColors position="top-center" offset={64} />
              <Analytics />
            </Providers>
          </NextIntlClientProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
