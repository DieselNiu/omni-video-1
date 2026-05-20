'use client';

import type { PricePlan } from '@/payment/types';
import { useTranslations } from 'next-intl';
import { websiteConfig } from './website';

/**
 * Get price plans with translations for client components
 *
 * NOTICE: This function should only be used in client components.
 * If you need to get the price plans in server components, use getAllPricePlans instead.
 * Use this function when showing the pricing table or the billing card to the user.
 *
 * docs:
 * https://mksaas.com/docs/config/price
 *
 * @returns The price plans with translated content
 */
export function usePricePlans(): Record<string, PricePlan> {
  const t = useTranslations('PricePlans');
  const priceConfig = websiteConfig.price;
  const plans: Record<string, PricePlan> = {};

  // Add free plan with translated content
  if (priceConfig.plans.free) {
    plans.free = {
      ...priceConfig.plans.free,
      name: t('free.name'),
      description: t('free.description'),
      features: [
        t('free.features.credits'),
        t('free.features.credits-usage'),
        t('free.features.daily-checkin'),
      ],
      limits: [t('free.limits.watermark'), t('free.limits.video-download')],
    };
  }

  // Add translated content to each plan
  if (priceConfig.plans.lite) {
    plans.lite = {
      ...priceConfig.plans.lite,
      name: t('lite.name'),
      description: t('lite.description'),
      features: [
        t('lite.features.credits'),
        t('lite.features.credits-usage'),
        t('lite.features.buy-more'),
        t('lite.features.image-4k-resolution'),
        t('lite.features.fast-generation'),
        t('lite.features.private-creation'),
        t('lite.features.no-watermarks'),
        t('lite.features.commercial-use'),
      ],
      limits: [],
    };
  }

  if (priceConfig.plans.pro) {
    plans.pro = {
      ...priceConfig.plans.pro,
      name: t('pro.name'),
      description: t('pro.description'),
      features: [
        t('pro.features.credits'),
        t('pro.features.credits-usage'),
        t('pro.features.buy-more'),
        t('pro.features.image-4k-resolution'),
        t('pro.features.fast-generation'),
        t('pro.features.private-creation'),
        t('pro.features.no-watermarks'),
        t('pro.features.commercial-use'),
      ],
      limits: [],
    };
  }

  if (priceConfig.plans.premium) {
    plans.premium = {
      ...priceConfig.plans.premium,
      name: t('premium.name'),
      description: t('premium.description'),
      features: [
        t('premium.features.credits'),
        t('premium.features.credits-usage'),
        t('premium.features.buy-more'),
        t('premium.features.image-4k-resolution'),
        t('premium.features.fast-generation'),
        t('premium.features.private-creation'),
        t('premium.features.no-watermarks'),
        t('premium.features.commercial-use'),
        t('premium.features.priority-support'),
      ],
      limits: [],
    };
  }

  return plans;
}
