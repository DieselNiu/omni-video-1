'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';

export function PricingHeader() {
  const t = useTranslations('PricingPage');

  return (
    <div className="space-y-2 sm:space-y-3 md:space-y-4 px-4 max-w-4xl mx-auto">
      {/* Crown - centered above title on mobile, inline on desktop */}
      <div className="flex flex-col items-center gap-2 sm:gap-0">
        <Image
          src="/intro/crown.png"
          alt="Crown"
          width={48}
          height={48}
          className="w-8 h-8 sm:hidden"
        />
        <h1 className="text-center text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold leading-tight sm:leading-tight md:leading-tight flex items-end justify-center gap-1.5 md:gap-2">
          <Image
            src="/intro/crown.png"
            alt="Crown"
            width={48}
            height={48}
            className="hidden sm:block relative sm:-top-1 sm:w-8 sm:h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 shrink-0"
          />
          <span>{t('title')}</span>
        </h1>
      </div>
    </div>
  );
}
