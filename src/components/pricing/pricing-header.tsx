'use client';

import { useTranslations } from 'next-intl';

export function PricingHeader() {
  const t = useTranslations('PricingPage');

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center px-4 text-center">
      <h1 className="text-5xl font-bold tracking-normal text-gray-950 sm:text-6xl md:text-7xl">
        {t('title')}
      </h1>
      <p className="mt-6 max-w-3xl text-lg font-medium leading-relaxed text-gray-500 sm:text-xl md:text-2xl">
        {t('subtitle')}
      </p>
    </div>
  );
}
