'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';

export function AssetEmptyState() {
  const t = useTranslations('Dashboard.assets.empty');

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <Image
        src="/intro/empty.png"
        alt=""
        width={240}
        height={160}
        className="opacity-80"
        priority
      />
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
        <p className="max-w-lg text-sm text-muted-foreground">
          {t('description')}
        </p>
      </div>
    </div>
  );
}
