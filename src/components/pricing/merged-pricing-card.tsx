'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useMounted } from '@/hooks/use-mounted';
import { useLocalePathname } from '@/i18n/navigation';
import { trackEvent } from '@/lib/analytics/track';
import { formatPrice } from '@/lib/formatter';
import { cn } from '@/lib/utils';
import {
  type PaymentType,
  PaymentTypes,
  type PlanInterval,
  PlanIntervals,
  type PricePlan,
} from '@/payment/types';
import { Check, CheckCircleIcon, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { LoginWrapper } from '../auth/login-wrapper';
import { Badge } from '../ui/badge';
import { CreditSlider, type CreditStep } from './credit-slider';
import { PaymentCheckoutDialog } from './payment-checkout-dialog';

interface MergedPricingCardProps {
  proPlan: PricePlan;
  premiumPlan: PricePlan;
  interval?: PlanInterval;
  paymentType?: PaymentType;
  metadata?: Record<string, string>;
  compact?: boolean;
  currentPlanId?: string | null;
  className?: string;
}

/**
 * Merged Pricing Card Component
 *
 * Combines Pro (3 tiers) + Premium into a single card with a credit slider.
 * Steps 0-2 use Pro tiers, Step 3 uses Premium plan.
 */
export function MergedPricingCard({
  proPlan,
  premiumPlan,
  interval,
  paymentType,
  compact = false,
  currentPlanId,
  className,
}: MergedPricingCardProps) {
  const t = useTranslations('PricingPage.PricingCard');
  const tPage = useTranslations('PricingPage');
  const currentUser = useCurrentUser();
  const currentPath = useLocalePathname();
  const mounted = useMounted();

  const [selectedStep, setSelectedStep] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Build slider steps from Pro tiers + Premium
  const proTiers = proPlan.tiers || [];

  const formatLabel = (amount: number) =>
    amount >= 1000 ? `${amount / 1000}K` : `${amount}`;

  // Compute $/credit (in thousandths) for each step using the current interval.
  // Cascading down so adjacent tiers don't collide at 3-decimal precision.
  const stepThousandths: number[] = [
    ...proTiers.map((tier) => {
      const p = tier.prices.find(
        (pr) =>
          pr.type === PaymentTypes.SUBSCRIPTION && pr.interval === interval
      );
      if (!p || !tier.credits.amount) return 0;
      const monthlyCents =
        interval === PlanIntervals.YEAR ? p.amount / 12 : p.amount;
      return Math.round((monthlyCents * 10) / tier.credits.amount);
    }),
    (() => {
      const p = premiumPlan.prices.find(
        (pr) =>
          pr.type === PaymentTypes.SUBSCRIPTION && pr.interval === interval
      );
      const c = premiumPlan.credits?.amount || 0;
      if (!p || !c) return 0;
      const monthlyCents =
        interval === PlanIntervals.YEAR ? p.amount / 12 : p.amount;
      return Math.round((monthlyCents * 10) / c);
    })(),
  ];
  for (let i = 1; i < stepThousandths.length; i++) {
    if (stepThousandths[i] >= stepThousandths[i - 1]) {
      stepThousandths[i] = stepThousandths[i - 1] - 1;
    }
  }
  const formatPerCredit = (thousandths: number) =>
    `$0.${String(thousandths).padStart(3, '0')} per credit`;

  const steps: CreditStep[] = [
    ...proTiers.map((tier, idx) => ({
      credits: tier.credits.amount,
      label: formatLabel(tier.credits.amount),
      badgeText: formatPerCredit(stepThousandths[idx]),
    })),
    {
      credits: premiumPlan.credits?.amount || 3000,
      label: formatLabel(premiumPlan.credits?.amount || 3000),
      badgeText: formatPerCredit(stepThousandths[proTiers.length]),
    },
  ];

  // Determine which plan/tier is currently active
  const isPremiumStep = selectedStep >= proTiers.length;
  const activePlan = isPremiumStep ? premiumPlan : proPlan;
  const activeTier = isPremiumStep ? null : proTiers[selectedStep];

  // Get prices and credits for the current step
  const prices = activeTier ? activeTier.prices : premiumPlan.prices;
  const credits = activeTier ? activeTier.credits : premiumPlan.credits;

  // Get price for current interval/type selection
  const price = prices.find((p) => {
    if (paymentType === PaymentTypes.ONE_TIME) {
      return p.type === PaymentTypes.ONE_TIME;
    }
    return p.type === PaymentTypes.SUBSCRIPTION && p.interval === interval;
  });

  // Card name changes based on step
  const cardName = isPremiumStep ? premiumPlan.name : proPlan.name;

  const cardDescription = isPremiumStep
    ? premiumPlan.description
    : proPlan.description;

  // Features — use Pro features for steps 0-2, Premium features for step 3
  const features = isPremiumStep ? premiumPlan.features : proPlan.features;
  const showNanoFamilyFeature = interval === PlanIntervals.YEAR;
  const hasTrackedYearly = useRef(false);

  useEffect(() => {
    if (showNanoFamilyFeature && !hasTrackedYearly.current) {
      trackEvent('pricing_yearly_pro_viewed', {
        interval,
        step: selectedStep,
      });
      hasTrackedYearly.current = true;
    }
  }, [showNanoFamilyFeature, interval, selectedStep]);

  const handleCheckoutClick = () => {
    if (showNanoFamilyFeature) {
      trackEvent('pricing_yearly_pro_cta_clicked', {
        interval,
        step: selectedStep,
      });
      trackEvent('pricing_yearly_pro_checkout_started', {
        interval,
        step: selectedStep,
      });
    }
    setDialogOpen(true);
  };

  // Check current plan
  const isCurrentPlan = currentPlanId === activePlan.id;

  // Format price
  let formattedPrice = '';
  let formattedOriginalPrice = '';
  let priceLabel = '';
  let billedYearlyText = '';
  let billedMonthlyText = '';

  if (price && price.amount > 0) {
    if (interval === PlanIntervals.YEAR) {
      const monthlyEquivalent = Math.round(price.amount / 12);
      formattedPrice = formatPrice(monthlyEquivalent, price.currency);
      priceLabel = t('perMonth');
      billedYearlyText = formatPrice(price.amount, price.currency);
      if (price.originalAmount && price.originalAmount > price.amount) {
        const originalMonthlyEquivalent = Math.round(price.originalAmount / 12);
        formattedOriginalPrice = formatPrice(
          originalMonthlyEquivalent,
          price.currency
        );
      }
    } else {
      formattedPrice = formatPrice(price.amount, price.currency);
      priceLabel = t('perMonth');
      billedMonthlyText = formatPrice(price.amount, price.currency);
      if (price.originalAmount && price.originalAmount > price.amount) {
        formattedOriginalPrice = formatPrice(
          price.originalAmount,
          price.currency
        );
      }
    }
  } else {
    formattedPrice = t('notAvailable');
  }

  const isPaidPlan = !!price;

  // Yearly savings (full year): (monthly × 12) − yearly total
  const monthlyStepPrice = prices.find(
    (p) =>
      p.type === PaymentTypes.SUBSCRIPTION && p.interval === PlanIntervals.MONTH
  );
  const yearlyStepPrice = prices.find(
    (p) =>
      p.type === PaymentTypes.SUBSCRIPTION && p.interval === PlanIntervals.YEAR
  );
  const yearlySavingsCents =
    monthlyStepPrice && yearlyStepPrice
      ? monthlyStepPrice.amount * 12 - yearlyStepPrice.amount
      : 0;
  const showSavingsBadge =
    interval === PlanIntervals.YEAR && yearlySavingsCents > 0;
  const yearlySavingsLabel = (yearlySavingsCents / 100).toFixed(0);
  // Marketing % off ramp — increases monotonically and tops out at 67% on the
  // far-right step to mirror the yearly toggle's "67% OFF" badge. Actual
  // savings shown alongside ($120/$240/$336/$480) are honest; this percentage
  // is a presentational ramp aligned with the headline discount on the toggle.
  const BADGE_PERCENT_RAMP = [30, 45, 55, 67];
  const yearlyOffPercent =
    BADGE_PERCENT_RAMP[selectedStep] ??
    BADGE_PERCENT_RAMP[BADGE_PERCENT_RAMP.length - 1];

  return (
    <Card
      className={cn(
        'flex flex-col h-full relative z-10 overflow-visible border-2 border-[#7c3aed] shadow-lg shadow-[#7c3aed]/20',
        compact && 'text-sm py-4 gap-3',
        isCurrentPlan &&
          'border-blue-500 shadow-lg shadow-blue-100 dark:shadow-blue-900/20',
        className
      )}
    >
      {/* Badge */}
      {isCurrentPlan ? (
        <div className="absolute -top-3.5 left-1/2 transform -translate-x-1/2">
          <Badge
            variant="default"
            className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 border-blue-200 dark:border-blue-800"
          >
            {t('currentPlan')}
          </Badge>
        </div>
      ) : (
        <div className="absolute -top-3.5 left-1/2 transform -translate-x-1/2">
          <Badge
            variant="default"
            className="bg-[#7c3aed] text-white hover:bg-[#6d28d9] transition-all"
          >
            {showSavingsBadge
              ? t('yearlyOffSaveBadge', {
                  percent: yearlyOffPercent,
                  amount: yearlySavingsLabel,
                })
              : t('bestValue')}
          </Badge>
        </div>
      )}

      <CardHeader className={cn(compact && 'px-4')}>
        <CardTitle>
          <h3 className="font-medium">{cardName}</h3>
        </CardTitle>

        <CardDescription>
          <p className={cn(compact ? 'text-xs' : 'text-sm')}>
            {cardDescription}
          </p>
        </CardDescription>

        {/* Credit Slider */}
        <div className={cn(compact ? 'my-2' : 'my-4')}>
          <CreditSlider
            steps={steps}
            currentStep={selectedStep}
            onStepChange={setSelectedStep}
            showHint={mounted}
          />
        </div>

        {/* Price display */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'block font-semibold',
              compact ? 'my-1 text-2xl' : 'my-2 text-4xl'
            )}
          >
            {formattedPrice}
          </span>
          {priceLabel && (
            <span className={cn('text-muted-foreground', compact && 'text-xs')}>
              {priceLabel}
            </span>
          )}
          {formattedOriginalPrice && (
            <span
              className={cn(
                'relative text-muted-foreground',
                compact ? 'text-sm' : 'text-xl'
              )}
            >
              {formattedOriginalPrice}
              <span className="absolute left-0 right-0 top-[55%] h-[1.5px] bg-muted-foreground" />
            </span>
          )}
        </div>
        {billedYearlyText && (
          <p className="text-sm text-muted-foreground">
            {tPage('billedYearly', { price: billedYearlyText })}
          </p>
        )}
        {billedMonthlyText && !billedYearlyText && (
          <p className="text-sm text-muted-foreground">
            {tPage('billedMonthly', { price: billedMonthlyText })}
          </p>
        )}

        {/* CTA Button */}
        <div className="relative">
          {isCurrentPlan ? (
            <Button
              disabled
              className={cn(
                compact ? 'mt-2' : 'mt-4',
                'w-full bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-100 hover:bg-blue-100 dark:hover:bg-blue-800 border border-blue-200 dark:border-blue-700'
              )}
            >
              {t('yourCurrentPlan')}
            </Button>
          ) : isPaidPlan ? (
            <div className="flex flex-col">
              {mounted && currentUser ? (
                <>
                  <Button
                    variant="default"
                    onClick={handleCheckoutClick}
                    className={cn(
                      compact ? 'mt-2' : 'mt-4',
                      'w-full cursor-pointer bg-[#7c3aed] text-white hover:bg-[#6d28d9] rounded-b-none'
                    )}
                  >
                    {t('getStarted')}
                  </Button>
                  <PaymentCheckoutDialog
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    userId={currentUser.id}
                    planId={activePlan.id}
                    priceId={price.priceId || ''}
                    planName={cardName || ''}
                    price={price.amount}
                    currency={price.currency}
                    interval={price.interval}
                    credits={credits?.amount}
                    features={features}
                    mode={
                      price.type === PaymentTypes.SUBSCRIPTION
                        ? 'subscription'
                        : 'payment'
                    }
                  />
                </>
              ) : (
                <LoginWrapper mode="modal" asChild callbackUrl={currentPath}>
                  <Button
                    variant="default"
                    className={cn(
                      compact ? 'mt-2' : 'mt-4',
                      'w-full cursor-pointer bg-[#7c3aed] text-white hover:bg-[#6d28d9] rounded-b-none'
                    )}
                  >
                    {t('getStarted')}
                  </Button>
                </LoginWrapper>
              )}
              <div className="w-full bg-[#6d28d9] text-white text-xs text-center py-1.5 rounded-b-md">
                {t('professionalChoice')}
              </div>
            </div>
          ) : (
            <Button
              disabled
              className={cn(compact ? 'mt-2' : 'mt-4', 'w-full')}
            >
              {t('notAvailable')}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className={cn(compact ? 'space-y-2 px-4' : 'space-y-4')}>
        <hr className="border-dashed" />

        {false && showNanoFamilyFeature && (
          <div className="rounded-lg border border-border/40 bg-muted/30 p-3 space-y-2">
            {/* Header */}
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold">
                  {t('nanoFamilyTitle')}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex">
                      <Info className="size-3.5 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-[280px] text-left"
                  >
                    {t('nanoFamilyTitleTooltip')}
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {t('nanoFamilySubtitle')}
              </p>
            </div>

            {/* Model list */}
            <div className="divide-y divide-border/40">
              {/* Nano Banana 2 */}
              <div className="flex items-center justify-between py-2 first:pt-0">
                <div className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-white shrink-0" />
                  <span className="text-xs">Nano Banana 2</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="inline-flex">
                        <Info className="size-3 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-[280px] text-left"
                    >
                      {t('nanoNB2Tooltip')}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-md bg-white/10 text-white border border-white/20 text-[10px] px-1.5 py-0.5 font-medium">
                    2K
                  </span>
                  <span className="rounded-md bg-white/10 text-white border border-white/20 text-[10px] px-1.5 py-0.5 font-medium whitespace-nowrap">
                    365 Unlimited
                  </span>
                </div>
              </div>

              {/* Nano Banana Pro */}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-white shrink-0" />
                  <span className="text-xs">Nano Banana Pro</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="inline-flex">
                        <Info className="size-3 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-[280px] text-left"
                    >
                      {t('nanoNBProTooltip')}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-md bg-white/10 text-white border border-white/20 text-[10px] px-1.5 py-0.5 font-medium">
                    2K
                  </span>
                  <span className="rounded-md bg-white/10 text-white border border-white/20 text-[10px] px-1.5 py-0.5 font-medium whitespace-nowrap">
                    365 Unlimited
                  </span>
                </div>
              </div>

              {/* Nano Banana */}
              <div className="flex items-center justify-between py-2 last:pb-0">
                <div className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-white shrink-0" />
                  <span className="text-xs">Nano Banana</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="inline-flex">
                        <Info className="size-3 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-[280px] text-left"
                    >
                      {t('nanoNBTooltip')}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-md bg-white/10 text-white border border-white/20 text-[10px] px-1.5 py-0.5 font-medium whitespace-nowrap">
                    365 Unlimited
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <ul
          className={cn(
            'list-outside',
            compact ? 'space-y-1 text-xs' : 'space-y-4 text-sm'
          )}
        >
          {/* Dynamic credits line */}
          {credits && (
            <>
              <li className="flex items-center gap-1.5">
                <CheckCircleIcon
                  className={cn(
                    'text-green-500 dark:text-green-400 shrink-0',
                    compact ? 'size-3' : 'size-4'
                  )}
                />
                {interval === PlanIntervals.YEAR ? (
                  <span className="flex items-center gap-1">
                    {t.rich('dynamicCreditsYearly', {
                      yearTotal: (credits.amount * 12).toLocaleString(),
                      highlight: (chunks) => (
                        <span className="font-semibold bg-gradient-to-r from-[#7c3aed] to-[#06b6d4] bg-clip-text text-transparent">
                          {chunks}
                        </span>
                      ),
                    })}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex">
                          <Info className="size-3.5 text-muted-foreground" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {t('dynamicCreditsYearlyTooltip', {
                          monthly: credits.amount.toLocaleString(),
                        })}
                      </TooltipContent>
                    </Tooltip>
                  </span>
                ) : (
                  <span>
                    {t.rich('dynamicCredits', {
                      credits: credits.amount,
                      highlight: (chunks) => (
                        <span className="font-semibold bg-gradient-to-r from-[#7c3aed] to-[#06b6d4] bg-clip-text text-transparent">
                          {chunks}
                        </span>
                      ),
                    })}
                  </span>
                )}
              </li>
              {(() => {
                const totalCredits =
                  interval === PlanIntervals.YEAR
                    ? credits.amount * 12
                    : credits.amount;
                return (
                  <>
                    <li className="flex items-center gap-1.5">
                      <CheckCircleIcon
                        className={cn(
                          'text-green-500 dark:text-green-400 shrink-0',
                          compact ? 'size-3' : 'size-4'
                        )}
                      />
                      <span>
                        {t.rich('dynamicVideosUsage', {
                          videos: Math.floor(totalCredits / 10),
                          highlight: (chunks) => (
                            <span className="font-semibold bg-gradient-to-r from-[#7c3aed] to-[#06b6d4] bg-clip-text text-transparent">
                              {chunks}
                            </span>
                          ),
                        })}
                      </span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircleIcon
                        className={cn(
                          'text-green-500 dark:text-green-400 shrink-0',
                          compact ? 'size-3' : 'size-4'
                        )}
                      />
                      <span>
                        {t.rich('dynamicImagesUsage', {
                          images: Math.floor(totalCredits / 2),
                          highlight: (chunks) => (
                            <span className="font-semibold bg-gradient-to-r from-[#7c3aed] to-[#06b6d4] bg-clip-text text-transparent">
                              {chunks}
                            </span>
                          ),
                        })}
                      </span>
                    </li>
                  </>
                );
              })()}
            </>
          )}
          {/* Static features (skip first two which are credits-related) */}
          {features?.slice(2, compact ? 5 : undefined).map((feature, i) => (
            <li key={i + 2} className="flex items-center gap-1.5">
              <CheckCircleIcon
                className={cn(
                  'text-green-500 dark:text-green-400 shrink-0',
                  compact ? 'size-3' : 'size-4'
                )}
              />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
