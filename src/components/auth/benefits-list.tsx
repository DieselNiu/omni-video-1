'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

export const BenefitsList = () => {
  const t = useTranslations('AuthPage.loginModal');

  const benefits = [
    {
      key: 'benefit1',
      content: <>{t('benefit1')}</>,
    },
    {
      key: 'benefit2',
      content: <>{t('benefit2')}</>,
    },
  ];

  return (
    <ul className="space-y-2.5">
      {benefits.map((benefit) => (
        <li key={benefit.key} className="flex items-start gap-2">
          <Check className="size-4 text-primary mt-0.5 shrink-0" />
          <span className="text-foreground text-sm">{benefit.content}</span>
        </li>
      ))}
    </ul>
  );
};
