'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePricePlans } from '@/config/price-config';
import type { PlanInterval } from '@/payment/types';
import { PlanIntervals } from '@/payment/types';
import { Check, Info } from 'lucide-react';
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
        <h3 className="text-lg font-semibold text-white">
          {t('supportedFeatures')}
        </h3>
        <ul className="flex flex-col gap-3">
          <li className="flex items-start gap-2.5">
            <Check className="size-4 shrink-0 mt-0.5 text-green-400" />
            <span className="text-sm text-gray-300">
              {t.rich('imagesPerYear', { images, highlight })}
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <Check className="size-4 shrink-0 mt-0.5 text-green-400" />
            <span className="text-sm text-gray-300">
              {t.rich('videosPerYear', { videos, highlight })}
            </span>
          </li>
          {PAY_ONCE_FEATURE_KEYS.map((key) => (
            <li key={key} className="flex items-start gap-2.5">
              <Check className="size-4 shrink-0 mt-0.5 text-green-400" />
              <span className="text-sm text-gray-300">
                {tPacks(`features.${key}` as 'features.allModels')}
              </span>
            </li>
          ))}
        </ul>
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
      <h3 className="text-lg font-semibold text-white">
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
              <Check className="size-4 shrink-0 text-green-400" />
              <span className="text-sm text-gray-300">
                {tPricing('nanoFamilyTitle')}
              </span>
              {nanoFamilyActive ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex">
                      <Info className="size-3.5 text-gray-400" />
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
                <span className="text-[9px] text-gray-500 border border-gray-600 rounded px-1 py-px leading-tight">
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
                  <span className="text-[12px] text-white">{item.name}</span>
                  <div className="flex items-center gap-1.5">
                    {item.badge && (
                      <span className="rounded bg-white/10 text-white border border-white/15 text-[9px] px-1 py-px font-medium leading-tight">
                        {item.badge}
                      </span>
                    )}
                    <span className="rounded bg-white/10 text-white border border-white/15 text-[9px] px-1 py-px font-medium whitespace-nowrap leading-tight">
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
          <Check className="size-4 shrink-0 mt-0.5 text-green-400" />
          <span className="text-sm text-gray-300">
            {t.rich(isYearly ? 'imagesPerYear' : 'imagesPerMonth', {
              images,
              highlight,
            })}
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <Check className="size-4 shrink-0 mt-0.5 text-green-400" />
          <span className="text-sm text-gray-300">
            {t.rich(isYearly ? 'videosPerYear' : 'videosPerMonth', {
              videos,
              highlight,
            })}
          </span>
        </li>

        {/* Rest of features from plan config */}
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check className="size-4 shrink-0 mt-0.5 text-green-400" />
            <span className="text-sm text-gray-300">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
