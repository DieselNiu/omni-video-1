'use client';

import { useCreditPackages } from '@/config/credits-config';
import { websiteConfig } from '@/config/website';
import { cn } from '@/lib/utils';
import type { PlanInterval } from '@/payment/types';
import { PlanIntervals } from '@/payment/types';
import { Check, Coins } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef, useState } from 'react';
import { LoginWrapper } from '../auth/login-wrapper';
import { PlanSlider } from './plan-slider';

export type UpgradeDialogTab = 'month' | 'year' | 'pay-once';

interface PricingPanelProps {
  tab: UpgradeDialogTab;
  onTabChange: (tab: UpgradeDialogTab) => void;
  selectedPlan: 'lite' | 'pro';
  onSelectedPlanChange: (plan: 'lite' | 'pro') => void;
  proTierIndex: number;
  onProTierIndexChange: (index: number) => void;
  selectedPackageId: string;
  onSelectedPackageIdChange: (id: string) => void;
  onBuyNow: () => void;
  isLoggedIn: boolean;
  showSliderHint?: boolean;
  title?: string;
  subtitle?: string;
}

function getProPriceData(tierIndex: number, interval: PlanInterval) {
  const { plans } = websiteConfig.price;
  if (tierIndex === 3) {
    const plan = plans.premium;
    const price = plan.prices.find((p) => p.interval === interval);
    return {
      monthlyPrice: price
        ? interval === PlanIntervals.YEAR
          ? price.amount / 12
          : price.amount
        : 0,
      originalMonthlyPrice: price?.originalAmount
        ? interval === PlanIntervals.YEAR
          ? price.originalAmount / 12
          : undefined
        : undefined,
      credits: plan.credits?.amount ?? 0,
      planName: 'Premium',
    };
  }
  const tier = plans.pro.tiers?.[tierIndex];
  if (!tier) return { monthlyPrice: 0, credits: 0, planName: 'Pro' };
  const price = tier.prices.find((p) => p.interval === interval);
  return {
    monthlyPrice: price
      ? interval === PlanIntervals.YEAR
        ? price.amount / 12
        : price.amount
      : 0,
    originalMonthlyPrice: price?.originalAmount
      ? interval === PlanIntervals.YEAR
        ? price.originalAmount / 12
        : undefined
      : undefined,
    credits: tier.credits.amount,
    planName: 'Pro',
  };
}

function getLitePriceData(interval: PlanInterval) {
  const plan = websiteConfig.price.plans.lite;
  const price = plan.prices.find((p) => p.interval === interval);
  return {
    monthlyPrice: price
      ? interval === PlanIntervals.YEAR
        ? price.amount / 12
        : price.amount
      : 0,
    originalMonthlyPrice: price?.originalAmount
      ? interval === PlanIntervals.YEAR
        ? price.originalAmount / 12
        : undefined
      : undefined,
    credits: (price?.credits ?? plan.credits)?.amount ?? 0,
  };
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Returns per-credit display strings for all 4 Pro/Premium tiers, guaranteed
 * to strictly decrease at 3-decimal precision. The natural rounded values
 * collide at adjacent tiers because the real per-credit delta is sub-$0.001
 * (e.g. tier1=$0.0408, tier2=$0.0406 both round to $0.041). We keep tier 0
 * at its true rounded value and cascade downward by $0.001 whenever a tier
 * would otherwise equal or exceed the previous. Downstream impact: tiers
 * 2 and 3 may under-state the unit price by ≤$0.001 — user-favorable.
 */
function getAllProTierPerCredits(interval: PlanInterval): string[] {
  const thousandths: number[] = [];
  for (let i = 0; i < 4; i++) {
    const data = getProPriceData(i, interval);
    if (!data.credits) {
      thousandths.push(0);
      continue;
    }
    // monthlyPrice is in cents; cents/credit × 10 = thousandths of a dollar / credit.
    thousandths.push(Math.round((data.monthlyPrice * 10) / data.credits));
  }
  for (let i = 1; i < thousandths.length; i++) {
    if (thousandths[i] >= thousandths[i - 1]) {
      thousandths[i] = thousandths[i - 1] - 1;
    }
  }
  return thousandths.map((n) => `$0.${String(n).padStart(3, '0')}`);
}

export function UpgradeDialogPricingPanel({
  tab,
  onTabChange,
  selectedPlan,
  onSelectedPlanChange,
  proTierIndex,
  onProTierIndexChange,
  selectedPackageId,
  onSelectedPackageIdChange,
  onBuyNow,
  isLoggedIn,
  showSliderHint,
  title,
  subtitle,
}: PricingPanelProps) {
  const t = useTranslations('UpgradeDialog');
  const pathname = usePathname();

  const isPayOnce = tab === 'pay-once';
  const interval: PlanInterval =
    tab === 'month' ? PlanIntervals.MONTH : PlanIntervals.YEAR;
  const isYearly = interval === PlanIntervals.YEAR;
  const proData = getProPriceData(proTierIndex, interval);
  const liteData = getLitePriceData(interval);

  const allProPerCredits = getAllProTierPerCredits(interval);
  const proPerCredit = allProPerCredits[proTierIndex] ?? '$0.000';
  const isTopTier = proTierIndex === 3;

  // Marketing % off ramp — mirrors merged-pricing-card.tsx so the upgrade
  // dialog's Flash Sale badge moves with the slider just like the pricing page.
  const BADGE_PERCENT_RAMP = [30, 45, 55, 67];
  const flashSalePercent =
    BADGE_PERCENT_RAMP[proTierIndex] ??
    BADGE_PERCENT_RAMP[BADGE_PERCENT_RAMP.length - 1];

  // Real $ savings for the current Pro tier when billed yearly:
  // (monthly_price × 12) − yearly_total. Same formula as merged-pricing-card.
  const { plans } = websiteConfig.price;
  const currentTier =
    proTierIndex === 3 ? plans.premium : plans.pro.tiers?.[proTierIndex];
  const tierMonthlyCents =
    currentTier?.prices.find((p) => p.interval === PlanIntervals.MONTH)
      ?.amount ?? 0;
  const tierYearlyCents =
    currentTier?.prices.find((p) => p.interval === PlanIntervals.YEAR)
      ?.amount ?? 0;
  const flashSaveAmount =
    tierMonthlyCents && tierYearlyCents
      ? Math.round((tierMonthlyCents * 12 - tierYearlyCents) / 100)
      : 0;

  // Clamp the floating $/credit pill inside the slider's bounding box. The
  // pill centers on the thumb by default, but when the thumb is near either
  // edge the pill would overflow the card; we measure actual widths and pin
  // the pill to 0 / container-width, then move the tail inside the pill so
  // it still points at the thumb. Thumb width = 20px (size-5 in PlanSlider).
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const [pillLayout, setPillLayout] = useState({ left: 0, tailLeft: 0 });
  useLayoutEffect(() => {
    const container = sliderContainerRef.current;
    const pill = pillRef.current;
    if (!container || !pill) return;
    const containerW = container.offsetWidth;
    const pillW = pill.offsetWidth;
    const sliderPercent = proTierIndex / 3;
    const thumbX = sliderPercent * containerW + (0.5 - sliderPercent) * 20;
    const idealLeft = thumbX - pillW / 2;
    const maxLeft = Math.max(0, containerW - pillW);
    const clampedLeft = Math.max(0, Math.min(idealLeft, maxLeft));
    setPillLayout({ left: clampedLeft, tailLeft: thumbX - clampedLeft });
  }, [proTierIndex, isYearly, proPerCredit, isTopTier]);

  const buyNowButton = (
    <button
      type="button"
      onClick={isLoggedIn ? onBuyNow : undefined}
      className="w-full py-3.5 rounded-full text-base font-semibold text-white bg-[#7c3aed] hover:bg-[#6d28d9] transition-colors"
    >
      {t('buyNow')}
    </button>
  );

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Title */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">{title ?? t('title')}</h2>
        {subtitle && <p className="mt-1.5 text-sm text-gray-400">{subtitle}</p>}
      </div>

      {/* Monthly / Yearly / Pay Once Toggle — pill segmented control */}
      <div className="flex items-center justify-center">
        <div className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-[#111] p-1">
          {(
            [
              { key: 'month', label: t('monthly'), badge: null },
              { key: 'year', label: t('yearly'), badge: t('saveBadge') },
              { key: 'pay-once', label: t('payOnce'), badge: null },
            ] as const
          ).map((opt) => {
            const active = tab === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onTabChange(opt.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                )}
              >
                {active && (
                  <span className="flex items-center justify-center size-4 rounded-full bg-[#7c3aed]">
                    <Check className="size-2.5 text-white" strokeWidth={3} />
                  </span>
                )}
                {opt.label}
                {opt.badge && (
                  <span
                    className={cn(
                      'text-xs font-semibold text-[#7c3aed] ml-1',
                      !active && 'invisible'
                    )}
                  >
                    {opt.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pay Once Cards — replaces subscription cards when active */}
      {isPayOnce && (
        <PayOnceCards
          selectedPackageId={selectedPackageId}
          onSelect={onSelectedPackageIdChange}
        />
      )}

      {!isPayOnce && (
        <>
          {/* Subscription cards begin */}

          {/* Pro / Premium Card — with optional Flash Sale badge */}
          <div className="relative">
            {/* Flash Sale Badge — overlapping top-left of card */}
            {isYearly && (
              <span className="absolute -top-3 left-4 z-10 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r from-[#7c3aed] to-[#06b6d4]">
                {t('flashSale', {
                  percent: flashSalePercent,
                  amount: flashSaveAmount,
                })}
              </span>
            )}

            <button
              type="button"
              onClick={() => onSelectedPlanChange('pro')}
              className="w-full relative rounded-xl p-[2px] transition-all"
              style={{
                background:
                  selectedPlan === 'pro'
                    ? 'linear-gradient(135deg, #7c3aed, #06b6d4, #8b5cf6)'
                    : 'transparent',
              }}
            >
              <div
                className={cn(
                  'flex flex-col gap-4 rounded-xl p-5',
                  selectedPlan === 'pro'
                    ? 'bg-[#111111]'
                    : 'bg-[#111111]/60 border border-gray-800'
                )}
              >
                {/* Row 1: radio+name on left, price on right */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        'flex items-center justify-center size-5 rounded-full border-2 shrink-0',
                        selectedPlan === 'pro'
                          ? 'border-[#7c3aed] bg-[#7c3aed]'
                          : 'border-gray-600 bg-transparent'
                      )}
                    >
                      {selectedPlan === 'pro' && (
                        <Check className="size-3 text-white" strokeWidth={3} />
                      )}
                    </span>
                    <span className="text-lg font-bold text-white">
                      {proTierIndex === 3 ? t('premium') : t('pro')}
                    </span>
                  </div>

                  <div className="flex flex-col items-end">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold text-white tabular-nums">
                        {formatPrice(proData.monthlyPrice)}
                      </span>
                      <div className="flex flex-col items-start text-xs text-gray-400">
                        <span
                          className={cn(
                            'line-through text-gray-500',
                            !(isYearly && proData.originalMonthlyPrice) &&
                              'invisible'
                          )}
                        >
                          {proData.originalMonthlyPrice
                            ? formatPrice(proData.originalMonthlyPrice)
                            : '$0.00'}
                        </span>
                        <span>{t('usdPerMonth')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Slider with floating $/credit pill that tracks the thumb */}
                <div ref={sliderContainerRef} className="relative pt-9">
                  <div
                    className="absolute top-0 pointer-events-none transition-[left] duration-150 ease-out"
                    style={{ left: `${pillLayout.left}px` }}
                  >
                    <div className="relative">
                      <span
                        ref={pillRef}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums whitespace-nowrap shadow-md',
                          isTopTier
                            ? 'bg-[#7c3aed] text-white'
                            : 'bg-white/10 text-[#7c3aed] border border-[#7c3aed]/40'
                        )}
                      >
                        {t('perCredit', { price: proPerCredit })}
                        {isTopTier && (
                          <span className="ml-0.5">· {t('bestValue')}</span>
                        )}
                      </span>
                      <span
                        className={cn(
                          'absolute top-full block size-0 border-x-[4px] border-x-transparent border-t-[4px] transition-[left] duration-150 ease-out',
                          isTopTier
                            ? 'border-t-[#7c3aed]'
                            : 'border-t-[#7c3aed]/40'
                        )}
                        style={{
                          left: `${pillLayout.tailLeft}px`,
                          transform: 'translateX(-50%)',
                        }}
                      />
                    </div>
                  </div>
                  <PlanSlider
                    value={proTierIndex}
                    onChange={onProTierIndexChange}
                    showHint={showSliderHint}
                  />
                </div>

                {/* Bottom row: credits left, billed annually right */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-400 tabular-nums">
                    {t('creditsPerMonth', {
                      credits: proData.credits.toLocaleString(),
                    })}
                  </p>
                  <p
                    className={cn(
                      'text-xs text-gray-500',
                      !isYearly && 'invisible'
                    )}
                  >
                    {t('billedAnnually')}
                  </p>
                </div>
              </div>
            </button>
          </div>

          {/* Lite Card */}
          <button
            type="button"
            onClick={() => onSelectedPlanChange('lite')}
            className="w-full relative rounded-xl p-[2px] transition-all"
            style={{
              background:
                selectedPlan === 'lite'
                  ? 'linear-gradient(135deg, #7c3aed, #06b6d4, #8b5cf6)'
                  : 'transparent',
            }}
          >
            <div
              className={cn(
                'flex flex-col gap-3 rounded-xl p-5',
                selectedPlan === 'lite'
                  ? 'bg-[#111111]'
                  : 'bg-[#111111]/60 border border-gray-800'
              )}
            >
              {/* Row 1: radio+name on left, price on right */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'flex items-center justify-center size-5 rounded-full border-2 shrink-0',
                      selectedPlan === 'lite'
                        ? 'border-[#7c3aed] bg-[#7c3aed]'
                        : 'border-gray-600 bg-transparent'
                    )}
                  >
                    {selectedPlan === 'lite' && (
                      <Check className="size-3 text-white" strokeWidth={3} />
                    )}
                  </span>
                  <span className="text-lg font-bold text-white">
                    {t('lite')}
                  </span>
                </div>

                <div className="flex flex-col items-end">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold text-white tabular-nums">
                      {formatPrice(liteData.monthlyPrice)}
                    </span>
                    <div className="flex flex-col items-start text-xs text-gray-400">
                      <span
                        className={cn(
                          'line-through text-gray-500',
                          !(isYearly && liteData.originalMonthlyPrice) &&
                            'invisible'
                        )}
                      >
                        {liteData.originalMonthlyPrice
                          ? formatPrice(liteData.originalMonthlyPrice)
                          : '$0.00'}
                      </span>
                      <span>{t('usdPerMonth')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Credits row */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400 tabular-nums">
                  {t('creditsPerMonth', {
                    credits: liteData.credits.toLocaleString(),
                  })}
                </p>
                <p
                  className={cn(
                    'text-xs text-gray-500',
                    !isYearly && 'invisible'
                  )}
                >
                  {t('billedAnnually')}
                </p>
              </div>
            </div>
          </button>
        </>
      )}

      {/* Buy Now Button */}
      {isLoggedIn ? (
        buyNowButton
      ) : (
        <LoginWrapper mode="modal" callbackUrl={pathname} asChild>
          {buyNowButton}
        </LoginWrapper>
      )}
    </div>
  );
}

interface PayOnceCardsProps {
  selectedPackageId: string;
  onSelect: (id: string) => void;
}

function PayOnceCards({ selectedPackageId, onSelect }: PayOnceCardsProps) {
  const t = useTranslations('UpgradeDialog');
  const allPackages = useCreditPackages();
  const packages = Object.values(allPackages).filter(
    (pkg) => !pkg.disabled && pkg.price.priceId
  );

  return (
    <div className="flex flex-col gap-4">
      {packages.map((pkg) => {
        const selected = pkg.id === selectedPackageId;
        const hasDiscount =
          pkg.price.originalAmount &&
          pkg.price.originalAmount > pkg.price.amount;
        const discountPercent = hasDiscount
          ? Math.round((1 - pkg.price.amount / pkg.price.originalAmount!) * 100)
          : 0;
        const formattedPrice = formatPrice(pkg.price.amount);
        const formattedOriginal = hasDiscount
          ? formatPrice(pkg.price.originalAmount!)
          : null;
        const perCredit = (pkg.price.amount / 100 / pkg.amount).toFixed(3);

        return (
          <div key={pkg.id} className="relative">
            {discountPercent > 0 && (
              <span className="absolute -top-3 left-4 z-10 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r from-[#7c3aed] to-[#06b6d4]">
                {t('packDiscount', { percent: discountPercent })}
              </span>
            )}
            <button
              type="button"
              onClick={() => onSelect(pkg.id)}
              className="w-full relative rounded-xl p-[2px] transition-all"
              style={{
                background: selected
                  ? 'linear-gradient(135deg, #7c3aed, #06b6d4, #8b5cf6)'
                  : 'transparent',
              }}
            >
              <div
                className={cn(
                  'flex flex-col gap-3 rounded-xl p-5',
                  selected
                    ? 'bg-[#111111]'
                    : 'bg-[#111111]/60 border border-gray-800'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        'flex items-center justify-center size-5 rounded-full border-2 shrink-0',
                        selected
                          ? 'border-[#7c3aed] bg-[#7c3aed]'
                          : 'border-gray-600 bg-transparent'
                      )}
                    >
                      {selected && (
                        <Check className="size-3 text-white" strokeWidth={3} />
                      )}
                    </span>
                    <span className="flex items-center gap-1.5 text-lg font-bold text-white">
                      <Coins className="size-4 text-[#7c3aed]" />
                      {t('packCredits', {
                        credits: pkg.amount.toLocaleString(),
                      })}
                    </span>
                  </div>

                  <div className="flex flex-col items-end">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold text-white tabular-nums">
                        {formattedPrice}
                      </span>
                      <div className="flex flex-col items-start text-xs text-gray-400">
                        <span
                          className={cn(
                            'line-through text-gray-500',
                            !formattedOriginal && 'invisible'
                          )}
                        >
                          {formattedOriginal ?? '$0.00'}
                        </span>
                        <span>{t('oneTime')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-400 tabular-nums">
                    {t('perCredit', { price: `$${perCredit}` })}
                  </p>
                  <p className="text-xs text-gray-500">{t('neverExpire')}</p>
                </div>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
