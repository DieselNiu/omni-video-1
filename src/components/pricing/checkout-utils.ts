import { websiteConfig } from '@/config/website';
import type { PlanInterval } from '@/payment/types';

export interface CheckoutData {
  planId: string;
  priceId: string;
  planName: string;
  price: number;
  currency: string;
  interval: PlanInterval;
  credits: number;
}

export function getCheckoutData(
  selectedPlan: 'lite' | 'pro',
  proTierIndex: number,
  interval: PlanInterval
): CheckoutData {
  const { plans } = websiteConfig.price;

  if (selectedPlan === 'lite') {
    const plan = plans.lite;
    const price = plan.prices.find((p) => p.interval === interval);
    return {
      planId: 'lite',
      priceId: price?.priceId ?? '',
      planName: 'Lite',
      price: price?.amount ?? 0,
      currency: price?.currency ?? 'USD',
      interval,
      credits: plan.credits?.amount ?? 0,
    };
  }

  if (proTierIndex === 3) {
    const plan = plans.premium;
    const price = plan.prices.find((p) => p.interval === interval);
    return {
      planId: 'premium',
      priceId: price?.priceId ?? '',
      planName: 'Premium',
      price: price?.amount ?? 0,
      currency: price?.currency ?? 'USD',
      interval,
      credits: plan.credits?.amount ?? 0,
    };
  }

  const tier = plans.pro.tiers?.[proTierIndex];
  const price = tier?.prices.find((p) => p.interval === interval);
  return {
    planId: 'pro',
    priceId: price?.priceId ?? '',
    planName: 'Pro',
    price: price?.amount ?? 0,
    currency: price?.currency ?? 'USD',
    interval,
    credits: tier?.credits.amount ?? 0,
  };
}
