import { CustomPage } from '@/components/page/custom-page';
import { DEFAULT_LOCALE } from '@/i18n/routing';
import { constructMetadata } from '@/lib/metadata';
import { pagesSource } from '@/lib/source';
import { getUrlWithLocale } from '@/lib/urls/urls';
import type { NextPageProps } from '@/types/next-page-props';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  if (locale !== DEFAULT_LOCALE) {
    return {
      alternates: {
        canonical: getUrlWithLocale('/privacy', DEFAULT_LOCALE),
      },
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  const page = pagesSource.getPage(['privacy-policy'], DEFAULT_LOCALE);

  if (!page) {
    console.warn(
      `generateMetadata, page not found for privacy-policy, locale: ${locale}`
    );
    return {};
  }

  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return constructMetadata({
    title: page.data.title + ' | ' + t('title'),
    description: page.data.description,
    locale,
    pathname: '/privacy',
    alternateLanguages: {
      en: getUrlWithLocale('/privacy', DEFAULT_LOCALE),
    },
  });
}

export default async function PrivacyPolicyPage(props: NextPageProps) {
  const params = await props.params;
  if (!params) {
    notFound();
  }

  const locale = params.locale as string;
  if (locale !== DEFAULT_LOCALE) {
    permanentRedirect('/privacy');
  }

  const page = pagesSource.getPage(['privacy-policy'], DEFAULT_LOCALE);

  if (!page) {
    notFound();
  }

  return <CustomPage page={page} />;
}
