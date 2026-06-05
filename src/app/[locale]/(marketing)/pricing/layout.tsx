import { PricingHeader } from '@/components/pricing/pricing-header';
import { websiteConfig } from '@/config/website';
import { constructMetadata } from '@/lib/metadata';
import { cn } from '@/lib/utils';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({ locale, namespace: 'PricingPage' });
  return constructMetadata({
    title: pt('title') + ' | ' + t('title'),
    description: pt('description'),
    locale,
    pathname: '/pricing',
  });
}

export default async function PricingPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // When showOnMarketing is enabled, announcement bar is hidden on pricing page
  // We use negative margin to compensate for the parent layout's padding
  // (parent has pt-28 for announcement bar + navbar, but we only need navbar height)
  const hasPromoCard = false;

  return (
    <div className={cn('mb-16', hasPromoCard && '-mt-10')}>
      <div className="flex w-full flex-col items-center justify-center gap-6 pt-14 md:gap-8 md:pt-20">
        {/* Header */}
        <PricingHeader />
      </div>

      {children}
    </div>
  );
}
