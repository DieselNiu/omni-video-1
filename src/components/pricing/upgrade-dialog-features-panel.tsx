'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePricePlans } from '@/config/price-config';
import { LocaleLink } from '@/i18n/navigation';
import type { PlanInterval } from '@/payment/types';
import { PlanIntervals } from '@/payment/types';
import { Routes } from '@/routes';
import { ArrowRight, Check, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type React from 'react';

interface FeaturesPanelProps {
  selectedPlan: 'lite' | 'pro';
  proTierIndex: number;
  credits: number;
  interval: PlanInterval;
  showNanoFamily?: boolean;
  payOnce?: { credits: number };
}

const PAY_ONCE_FEATURE_KEYS = [
  'allModels',
  'noExpiry',
  'highRes',
  'noWatermarks',
  'commercialUse',
  'stackWithSubscription',
] as const;

function ViewAllFeaturesLink() {
  return (
    <LocaleLink
      href={Routes.Pricing}
      className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#6359a6] transition-colors hover:text-[#544a96]"
    >
      <span>View all features and benefits</span>
      <ArrowRight className="size-4" />
    </LocaleLink>
  );
}

export function UpgradeDialogFeaturesPanel({
  selectedPlan,
  proTierIndex,
  credits,
  interval,
  showNanoFamily,
  payOnce,
}: FeaturesPanelProps) {
  const t = useTranslations('UpgradeDialog');
  const tPricing = useTranslations('PricingPage.PricingCard');
  const tPacks = useTranslations('PricingPage.creditPacks');
  const plans = usePricePlans();

  if (payOnce) {
    const totalCredits = payOnce.credits;
    const videos = Math.floor(totalCredits / 10);
    const images = Math.floor(totalCredits / 2);
    const highlight = (chunks: React.ReactNode) => (
      <span className="font-semibold bg-gradient-to-r from-[#7c3aed] to-[#06b6d4] bg-clip-text text-transparent">
        {chunks}
      </span>
    );
    return (
      <div className="flex flex-col gap-4 py-2">
        <h3 className="text-lg font-semibold text-gray-950">
          {t('supportedFeatures')}
        </h3>
        <ul className="flex flex-col gap-3">
          <li className="flex items-start gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-[#6359a6]" />
            <span className="text-sm text-gray-700">
              {t.rich('imagesPerYear', { images, highlight })}
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-[#6359a6]" />
            <span className="text-sm text-gray-700">
              {t.rich('videosPerYear', { videos, highlight })}
            </span>
          </li>
          {PAY_ONCE_FEATURE_KEYS.map((key) => (
            <li key={key} className="flex items-start gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-[#6359a6]" />
              <span className="text-sm text-gray-700">
                {tPacks(`features.${key}` as 'features.allModels')}
              </span>
            </li>
          ))}
        </ul>
        <ViewAllFeaturesLink />
      </div>
    );
  }

  // Yearly plans bill once but credits accrue across all 12 months. Show the
  // "up to N videos/images" totals against the FULL annual credit pool, not
  // a single month — matches pricing-card.tsx and merged-pricing-card.tsx.
  const isYearly = interval === PlanIntervals.YEAR;
  const totalCredits = isYearly ? credits * 12 : credits;
  const videos = Math.floor(totalCredits / 10);
  const images = Math.floor(totalCredits / 2);
  const isLite = selectedPlan === 'lite';

  const highlight = (chunks: React.ReactNode) =>
    isLite ? (
      <>{chunks}</>
    ) : (
      <span className="font-semibold bg-gradient-to-r from-[#7c3aed] to-[#06b6d4] bg-clip-text text-transparent">
        {chunks}
      </span>
    );

  // Get features from the relevant plan, skip first 2 items (credits and credits-usage)
  const planKey =
    selectedPlan === 'lite' ? 'lite' : proTierIndex === 3 ? 'premium' : 'pro';
  const plan = plans[planKey];
  const features = plan?.features?.slice(2) ?? [];

  const nanoFamilyActive = showNanoFamily && !isLite;

  return (
    <div className="flex flex-col gap-4 py-2">
      <h3 className="text-lg font-semibold text-gray-950">
        {t('supportedFeatures')}
      </h3>

      <ul className="flex flex-col gap-3">
        {/* Nano Family — inline rows at top of features list */}
        {showNanoFamily && !isLite && (
          <li
            className={`flex flex-col gap-1.5 transition-opacity ${nanoFamilyActive ? 'opacity-100' : 'opacity-40'}`}
          >
            {/* Row 1: check + title + tooltip/badge */}
            <div className="flex items-center gap-2.5">
              <Check className="size-4 shrink-0 text-[#6359a6]" />
              <span className="text-sm text-gray-700">
                {tPricing('nanoFamilyTitle')}
              </span>
              {nanoFamilyActive ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex">
                      <Info className="size-3.5 text-gray-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-[280px] text-left"
                  >
                    {tPricing('nanoFamilyTitleTooltip')}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span className="rounded border border-gray-300 px-1 py-px text-[9px] leading-tight text-gray-500">
                  Yearly
                </span>
              )}
            </div>
            {/* Row 2+: indented model list, one per line */}
            <div className="flex flex-col gap-1 pl-[26px]">
              {[
                { name: 'Nano Banana 2', badge: '2K' },
                { name: 'Nano Banana Pro', badge: '2K' },
                { name: 'Nano Banana', badge: null },
              ].map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between"
                >
                  <span className="text-[12px] text-gray-900">{item.name}</span>
                  <div className="flex items-center gap-1.5">
                    {item.badge && (
                      <span className="rounded border border-gray-200 bg-white px-1 py-px text-[9px] font-medium leading-tight text-gray-800">
                        {item.badge}
                      </span>
                    )}
                    <span className="whitespace-nowrap rounded border border-gray-200 bg-white px-1 py-px text-[9px] font-medium leading-tight text-gray-800">
                      365 Unlimited
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </li>
        )}

        {/* Dynamic rows: images + videos */}
        <li className="flex items-start gap-2.5">
          <Check className="mt-0.5 size-4 shrink-0 text-[#6359a6]" />
          <span className="text-sm text-gray-700">
            {t.rich(isYearly ? 'imagesPerYear' : 'imagesPerMonth', {
              images,
              highlight,
            })}
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <Check className="mt-0.5 size-4 shrink-0 text-[#6359a6]" />
          <span className="text-sm text-gray-700">
            {t.rich(isYearly ? 'videosPerYear' : 'videosPerMonth', {
              videos,
              highlight,
            })}
          </span>
        </li>

        {/* Rest of features from plan config */}
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-[#6359a6]" />
            <span className="text-sm text-gray-700">{feature}</span>
          </li>
        ))}
      </ul>
      <ViewAllFeaturesLink />
    </div>
  );
}
