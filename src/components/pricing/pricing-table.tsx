'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { usePricePlans } from '@/config/price-config';
import { trackEvent } from '@/lib/analytics/track';
import { cn } from '@/lib/utils';
import {
  type PaymentType,
  PaymentTypes,
  type PlanInterval,
  PlanIntervals,
  type PricePlan,
} from '@/payment/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CreditPacksInline } from './credit-packs-inline';
import { FreeHorizontalPlan } from './free-horizontal-plan';
import { MergedPricingCard } from './merged-pricing-card';
import { PricingCard } from './pricing-card';

type PricingTab = 'year' | 'month' | 'one-time';

/**
 * Check if a plan has prices of a specific payment type
 * Supports both regular prices and tier-based prices
 */
function planHasPriceType(plan: PricePlan, paymentType: PaymentType): boolean {
  // Check direct prices
  const hasDirectPrice = plan.prices.some(
    (price) => !price.disabled && price.type === paymentType
  );
  if (hasDirectPrice) return true;

  // Check tier prices
  if (plan.tiers && plan.tiers.length > 0) {
    return plan.tiers.some((tier) =>
      tier.prices.some((price) => !price.disabled && price.type === paymentType)
    );
  }

  return false;
}

/**
 * Check if a plan has prices for a specific interval
 * Supports both regular prices and tier-based prices
 */
function planHasInterval(plan: PricePlan, interval: PlanInterval): boolean {
  // Check direct prices
  const hasDirectPrice = plan.prices.some(
    (price) =>
      price.type === PaymentTypes.SUBSCRIPTION && price.interval === interval
  );
  if (hasDirectPrice) return true;

  // Check tier prices
  if (plan.tiers && plan.tiers.length > 0) {
    return plan.tiers.some((tier) =>
      tier.prices.some(
        (price) =>
          price.type === PaymentTypes.SUBSCRIPTION &&
          price.interval === interval
      )
    );
  }

  return false;
}

interface PricingTableProps {
  metadata?: Record<string, string>;
  currentPlan?: PricePlan | null;
  className?: string;
  /** When true, uses a more compact layout suitable for dialogs */
  compact?: boolean;
}

/**
 * Pricing Table Component
 *
 * 1. Displays all pricing plans with interval selection tabs for subscription plans,
 * free plans and one-time purchase plans are always displayed
 * 2. If a plan is disabled, it will not be displayed in the pricing table
 * 3. If a price is disabled, it will not be displayed in the pricing table
 */
export function PricingTable({
  metadata,
  currentPlan,
  className,
  compact = false,
}: PricingTableProps) {
  const t = useTranslations('PricingPage');
  const [tab, setTab] = useState<PricingTab>('year');
  const isOneTime = tab === 'one-time';
  const interval: PlanInterval =
    tab === 'month' ? PlanIntervals.MONTH : PlanIntervals.YEAR;

  // Get price plans with translations
  const pricePlans = usePricePlans();
  const plans = Object.values(pricePlans);

  // Current plan ID for comparison
  const currentPlanId = currentPlan?.id || null;

  // Extract specific plans for the new layout
  const freePlan = plans.find((p) => p.isFree && !p.disabled);
  const litePlan = plans.find((p) => p.id === 'lite' && !p.disabled);
  const proPlan = plans.find((p) => p.id === 'pro' && !p.disabled);
  const premiumPlan = plans.find((p) => p.id === 'premium' && !p.disabled);

  // Check if we can use the merged layout (need both pro and premium)
  const useMergedLayout = !!(proPlan && premiumPlan);

  // Filter plans into categories (for fallback generic rendering)
  const subscriptionPlans = plans.filter(
    (plan) =>
      !plan.isFree &&
      !plan.disabled &&
      planHasPriceType(plan, PaymentTypes.SUBSCRIPTION)
  );

  const oneTimePlans = plans.filter(
    (plan) =>
      !plan.isFree &&
      !plan.disabled &&
      planHasPriceType(plan, PaymentTypes.ONE_TIME)
  );

  // Check if any plan has a monthly price option
  const hasMonthlyOption = subscriptionPlans.some((plan) =>
    planHasInterval(plan, PlanIntervals.MONTH)
  );

  // Check if any plan has a yearly price option
  const hasYearlyOption = subscriptionPlans.some((plan) =>
    planHasInterval(plan, PlanIntervals.YEAR)
  );

  const handleTabChange = (value: string) => {
    setTab(value as PricingTab);
    trackEvent('pricing_interval_changed', { interval: value });
  };

  return (
    <div
      className={cn('flex flex-col', compact ? 'gap-6' : 'gap-12', className)}
    >
      {/* Show interval toggle if there are subscription plans */}
      {(hasMonthlyOption || hasYearlyOption) &&
        subscriptionPlans.length > 0 && (
          <div className="flex justify-center pt-3">
            <ToggleGroup
              size="sm"
              type="single"
              value={tab}
              onValueChange={(value) => value && handleTabChange(value)}
              className="relative border border-border/50 rounded-full p-1 bg-muted/30"
            >
              {hasMonthlyOption && (
                <ToggleGroupItem
                  value="month"
                  className={cn(
                    '!rounded-full px-5 py-1.5 cursor-pointer text-sm',
                    'hover:bg-transparent hover:text-foreground',
                    'data-[state=on]:bg-background data-[state=on]:text-foreground',
                    'data-[state=off]:bg-transparent data-[state=off]:text-muted-foreground'
                  )}
                >
                  {t('monthly')}
                </ToggleGroupItem>
              )}
              {hasYearlyOption && (
                <ToggleGroupItem
                  value="year"
                  className={cn(
                    'relative !rounded-full px-5 py-1.5 cursor-pointer text-sm',
                    'hover:bg-transparent hover:text-foreground',
                    'data-[state=on]:bg-background data-[state=on]:text-foreground',
                    'data-[state=off]:bg-transparent data-[state=off]:text-muted-foreground'
                  )}
                >
                  {t('yearly')}
                  <span className="absolute -top-2.5 -right-2 bg-[#7c3aed] text-white text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap shadow-md">
                    {t('yearlyDiscount')}
                  </span>
                </ToggleGroupItem>
              )}
              <ToggleGroupItem
                value="one-time"
                className={cn(
                  '!rounded-full px-5 py-1.5 cursor-pointer text-sm',
                  'hover:bg-transparent hover:text-foreground',
                  'data-[state=on]:bg-background data-[state=on]:text-foreground',
                  'data-[state=off]:bg-transparent data-[state=off]:text-muted-foreground'
                )}
              >
                {t('payOnce')}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

      {isOneTime ? (
        <CreditPacksInline />
      ) : useMergedLayout ? (
        <>
          <div
            className={cn(
              'grid w-full mx-auto',
              compact ? 'gap-4' : 'gap-6',
              litePlan
                ? 'grid-cols-1 md:grid-cols-2 max-w-4xl'
                : 'grid-cols-1 max-w-md'
            )}
          >
            <MergedPricingCard
              proPlan={proPlan}
              premiumPlan={premiumPlan}
              interval={interval}
              paymentType={PaymentTypes.SUBSCRIPTION}
              compact={compact}
              currentPlanId={currentPlanId}
            />

            {litePlan && (
              <PricingCard
                plan={litePlan}
                interval={interval}
                paymentType={PaymentTypes.SUBSCRIPTION}
                isCurrentPlan={currentPlanId === litePlan.id}
                compact={compact}
                highlightLabel={
                  interval === PlanIntervals.YEAR
                    ? t('PricingCard.bestForStarters')
                    : undefined
                }
              />
            )}

            {/* One-time plans (if any) */}
            {oneTimePlans.map((plan) => (
              <PricingCard
                key={plan.id}
                plan={plan}
                paymentType={PaymentTypes.ONE_TIME}
                isCurrentPlan={currentPlanId === plan.id}
                compact={compact}
              />
            ))}
          </div>

          {freePlan && (
            <FreeHorizontalPlan
              plan={freePlan}
              isCurrentPlan={currentPlanId === freePlan.id}
              compact={compact}
              className={litePlan ? 'max-w-4xl mx-auto' : 'max-w-md mx-auto'}
            />
          )}
        </>
      ) : (
        /* Fallback: generic rendering for unexpected plan structures */
        (() => {
          const freePlans = plans.filter(
            (plan) => plan.isFree && !plan.disabled
          );
          const totalVisiblePlans =
            freePlans.length + subscriptionPlans.length + oneTimePlans.length;
          return (
            <div
              className={cn(
                'grid',
                compact ? 'gap-4' : 'gap-6',
                totalVisiblePlans === 1 &&
                  'grid-cols-1 max-w-md mx-auto w-full',
                totalVisiblePlans === 2 &&
                  'grid-cols-1 md:grid-cols-2 max-w-2xl mx-auto w-full',
                totalVisiblePlans >= 3 &&
                  (compact
                    ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
                    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3')
              )}
            >
              {freePlans.map((plan) => (
                <PricingCard
                  key={plan.id}
                  plan={plan}
                  isCurrentPlan={currentPlanId === plan.id}
                  compact={compact}
                />
              ))}
              {subscriptionPlans.map((plan) => (
                <PricingCard
                  key={plan.id}
                  plan={plan}
                  interval={interval}
                  paymentType={PaymentTypes.SUBSCRIPTION}
                  isCurrentPlan={currentPlanId === plan.id}
                  compact={compact}
                />
              ))}
              {oneTimePlans.map((plan) => (
                <PricingCard
                  key={plan.id}
                  plan={plan}
                  paymentType={PaymentTypes.ONE_TIME}
                  isCurrentPlan={currentPlanId === plan.id}
                  compact={compact}
                />
              ))}
            </div>
          );
        })()
      )}
    </div>
  );
}
