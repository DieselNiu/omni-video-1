'use client';

import type { CreditPackage } from '@/credits/types';
import { useTranslations } from 'next-intl';
import { websiteConfig } from './website';

/**
 * Get credit packages with translations for client components
 *
 * NOTICE: This function should only be used in client components.
 * If you need to get the credit packages in server components, use getAllCreditPackages instead.
 * Use this function when showing the credit packages to the user.
 *
 * docs:
 * https://mksaas.com/docs/config/credits
 *
 * @returns The credit packages with translated content
 */
export function useCreditPackages(): Record<string, CreditPackage> {
  const t = useTranslations('CreditPackages');
  const creditConfig = websiteConfig.credits;
  const packages: Record<string, CreditPackage> = {};

  if (creditConfig.packages.standard) {
    packages.standard = {
      ...creditConfig.packages.standard,
      name: t('standard.name'),
      description: t('standard.description'),
    };
  }

  if (creditConfig.packages.large) {
    packages.large = {
      ...creditConfig.packages.large,
      name: t('large.name'),
      description: t('large.description'),
    };
  }

  return packages;
}
