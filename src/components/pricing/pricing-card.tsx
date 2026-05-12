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
import { formatPrice } from '@/lib/formatter';
import { cn } from '@/lib/utils';
import {
  type PaymentType,
  PaymentTypes,
  type PlanInterval,
  PlanIntervals,
  type Price,
  type PricePlan,
} from '@/payment/types';
import { CheckCircleIcon, Info, XCircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useState } from 'react';
import { LoginWrapper } from '../auth/login-wrapper';
import { Badge } from '../ui/badge';
import { PaymentCheckoutDialog } from './payment-checkout-dialog';
import { TierSelector } from './tier-selector';

interface PricingCardProps {
  plan: PricePlan;
  interval?: PlanInterval; // 'month' or 'year'
  paymentType?: PaymentType; // 'subscription' or 'one_time'
  className?: string;
  isCurrentPlan?: boolean;
  /** When true, uses a more compact layout suitable for dialogs */
  compact?: boolean;
  /** Optional highlight label that renders the bestValue-style frame + badge */
  highlightLabel?: string;
}

/**
 * Get the appropriate price object for the selected interval and payment type
 * @param prices The prices array (from plan or tier)
 * @param interval The selected interval (month or year)
 * @param paymentType The payment type (SUBSCRIPTION or one_time)
 * @returns The price object or undefined if not found
 */
function getPriceFromArray(
  prices: Price[],
  interval?: PlanInterval,
  paymentType?: PaymentType
): Price | undefined {
  return prices.find((price) => {
    if (paymentType === PaymentTypes.ONE_TIME) {
      return price.type === PaymentTypes.ONE_TIME;
    }
    return (
      price.type === PaymentTypes.SUBSCRIPTION && price.interval === interval
    );
  });
}

/**
 * Check if plan has tiers
 */
function hasTiers(plan: PricePlan): boolean {
  return !!(plan.tiers && plan.tiers.length > 0);
}

/**
 * Pricing Card Component
 *
 * Displays a single pricing plan with features and action button
 */
export function PricingCard({
  plan,
  interval,
  paymentType,
  className,
  isCurrentPlan = false,
  compact = false,
  highlightLabel,
}: PricingCardProps) {
  const t = useTranslations('PricingPage.PricingCard');
  const tPage = useTranslations('PricingPage');
  const currentUser = useCurrentUser();
  const currentPath = useLocalePathname();
  const mounted = useMounted();

  // Tier selection state (for multi-tier plans)
  const [selectedTierIndex, setSelectedTierIndex] = useState(0);

  // Payment dialog state
  const [dialogOpen, setDialogOpen] = useState(false);

  // Determine if this plan has tiers
  const planHasTiers = hasTiers(plan);

  // Get current tier (if plan has tiers)
  const currentTier = planHasTiers ? plan.tiers![selectedTierIndex] : null;

  // Get prices array (from tier or plan)
  const prices = planHasTiers ? currentTier!.prices : plan.prices;

  // Get price for current selection
  const price = plan.isFree
    ? undefined
    : getPriceFromArray(prices, interval, paymentType);

  // Get credits (from tier or plan, with optional per-price override)
  const credits = planHasTiers
    ? currentTier!.credits
    : (price?.credits ?? plan.credits);

  // Tier navigation handlers
  const handleIncreaseTier = () => {
    if (planHasTiers && selectedTierIndex < plan.tiers!.length - 1) {
      setSelectedTierIndex(selectedTierIndex + 1);
    }
  };

  const handleDecreaseTier = () => {
    if (selectedTierIndex > 0) {
      setSelectedTierIndex(selectedTierIndex - 1);
    }
  };

  // generate formatted price and price label
  let formattedPrice = '';
  let formattedOriginalPrice = '';
  let priceLabel = '';
  let billedYearlyText = '';
  let billedMonthlyText = '';
  if (plan.isFree) {
    formattedPrice = t('freePrice');
  } else if (price && price.amount > 0) {
    // For yearly plans, show monthly equivalent price
    if (interval === PlanIntervals.YEAR) {
      const monthlyEquivalent = Math.round(price.amount / 12);
      formattedPrice = formatPrice(monthlyEquivalent, price.currency);
      priceLabel = t('perMonth');
      // Show total yearly cost below
      billedYearlyText = formatPrice(price.amount, price.currency);
      // Calculate original monthly price for strikethrough (from monthly plan price)
      if (price.originalAmount && price.originalAmount > price.amount) {
        const originalMonthlyEquivalent = Math.round(price.originalAmount / 12);
        formattedOriginalPrice = formatPrice(
          originalMonthlyEquivalent,
          price.currency
        );
      }
    } else {
      // Monthly plan - show as-is
      formattedPrice = formatPrice(price.amount, price.currency);
      priceLabel = t('perMonth');
      // Show monthly billed text for monthly plans
      billedMonthlyText = formatPrice(price.amount, price.currency);
      // check if original price is available for strikethrough display
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

  // check if plan is not free and has a price
  const isPaidPlan = !plan.isFree && !!price;
  // check if plan has a trial period, period is greater than 0
  const hasTrialPeriod = price?.trialPeriodDays && price.trialPeriodDays > 0;

  return (
    <Card
      className={cn(
        'flex flex-col h-full',
        (plan.popular || plan.bestValue || highlightLabel) && 'relative',
        isCurrentPlan &&
          'border-blue-500 shadow-lg shadow-blue-100 dark:shadow-blue-900/20',
        (plan.bestValue || highlightLabel) &&
          !isCurrentPlan &&
          'border-2 border-[#7c3aed] shadow-lg shadow-[#7c3aed]/20',
        compact && 'text-sm py-4 gap-3',
        className
      )}
    >
      {/* show popular badge if plan is recommended */}
      {plan.popular && !isCurrentPlan && (
        <div className="absolute -top-3.5 left-1/2 transform -translate-x-1/2">
          <Badge
            variant="default"
            className="bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
          >
            {t('popular')}
          </Badge>
        </div>
      )}

      {/* show best value badge if plan is best value */}
      {plan.bestValue && !isCurrentPlan && !plan.popular && (
        <div className="absolute -top-3.5 left-1/2 transform -translate-x-1/2">
          <Badge
            variant="default"
            className="bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
          >
            {t('bestValue')}
          </Badge>
        </div>
      )}

      {/* show custom highlight badge */}
      {highlightLabel && !isCurrentPlan && !plan.popular && !plan.bestValue && (
        <div className="absolute -top-3.5 left-1/2 transform -translate-x-1/2">
          <Badge
            variant="default"
            className="bg-[#7c3aed] text-white hover:bg-[#6d28d9] whitespace-nowrap"
          >
            {highlightLabel}
          </Badge>
        </div>
      )}

      {/* show current plan badge if plan is current plan */}
      {isCurrentPlan && (
        <div className="absolute -top-3.5 left-1/2 transform -translate-x-1/2">
          <Badge
            variant="default"
            className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 border-blue-200 dark:border-blue-800"
          >
            {t('currentPlan')}
          </Badge>
        </div>
      )}

      <CardHeader className={cn(compact && 'px-4')}>
        <CardTitle>
          <h3 className="font-medium">{plan.name}</h3>
        </CardTitle>

        <CardDescription>
          <p className={cn(compact ? 'text-xs' : 'text-sm')}>
            {plan.description}
          </p>
        </CardDescription>

        {/* show price and price label */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'block font-semibold',
              compact ? 'my-2 text-2xl' : 'my-4 text-4xl'
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
          {/* Tier selector for multi-tier plans */}
          {planHasTiers && (
            <TierSelector
              currentIndex={selectedTierIndex}
              totalTiers={plan.tiers!.length}
              onIncrease={handleIncreaseTier}
              onDecrease={handleDecreaseTier}
            />
          )}
        </div>
        {/* show yearly billed total for yearly plans */}
        {billedYearlyText && (
          <p className="text-sm text-muted-foreground">
            {tPage('billedYearly', { price: billedYearlyText })}
          </p>
        )}
        {/* show monthly billed total for monthly plans */}
        {billedMonthlyText && !billedYearlyText && (
          <p className="text-sm text-muted-foreground">
            {tPage('billedMonthly', { price: billedMonthlyText })}
          </p>
        )}

        {/* show action buttons based on plans */}
        <div className="relative">
          {/* Arrow pointing to best value plan button - hidden in compact mode */}
          {plan.bestValue && !isCurrentPlan && !compact && (
            <div className="absolute -right-24 -top-8 hidden lg:block">
              <Image
                src="/intro/arrow_pointing.gif"
                alt="Arrow pointing to recommended plan"
                width={100}
                height={100}
                className="invert -scale-x-100"
                unoptimized
              />
            </div>
          )}

          {plan.isFree ? (
            mounted && currentUser ? (
              <Button
                variant="outline"
                className={cn(compact ? 'mt-2' : 'mt-4', 'w-full disabled')}
              >
                {t('tryNow')}
              </Button>
            ) : (
              <LoginWrapper mode="modal" asChild callbackUrl={currentPath}>
                <Button
                  variant="outline"
                  className={cn(
                    compact ? 'mt-2' : 'mt-4',
                    'w-full cursor-pointer'
                  )}
                >
                  {t('tryNow')}
                </Button>
              </LoginWrapper>
            )
          ) : isCurrentPlan ? (
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
            <div className={cn(plan.bestValue && 'flex flex-col')}>
              {mounted && currentUser ? (
                <>
                  <Button
                    variant={plan.bestValue ? 'default' : 'outline'}
                    onClick={() => setDialogOpen(true)}
                    className={cn(
                      compact ? 'mt-2' : 'mt-4',
                      'w-full cursor-pointer',
                      plan.bestValue &&
                        'bg-[#7c3aed] text-white hover:bg-[#6d28d9] rounded-b-none'
                    )}
                  >
                    {plan.isLifetime
                      ? t('getLifetimeAccess')
                      : plan.bestValue
                        ? t('getStarted')
                        : t('buyNow')}
                  </Button>
                  <PaymentCheckoutDialog
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    userId={currentUser.id}
                    planId={plan.id}
                    priceId={price.priceId || ''}
                    planName={plan.name || ''}
                    price={price.amount}
                    currency={price.currency}
                    interval={price.interval}
                    credits={credits?.amount}
                    features={plan.features}
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
                    variant={plan.bestValue ? 'default' : 'outline'}
                    className={cn(
                      compact ? 'mt-2' : 'mt-4',
                      'w-full cursor-pointer',
                      plan.bestValue &&
                        'bg-[#7c3aed] text-white hover:bg-[#6d28d9] rounded-b-none'
                    )}
                  >
                    {plan.bestValue ? t('getStarted') : t('buyNow')}
                  </Button>
                </LoginWrapper>
              )}
              {plan.bestValue && (
                <div className="w-full bg-[#6d28d9] text-white text-xs text-center py-1.5 rounded-b-md">
                  {t('professionalChoice')}
                </div>
              )}
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

        {/* show trial period if it exists */}
        {hasTrialPeriod && (
          <div className={cn(compact ? 'my-2' : 'my-4')}>
            <span
              className="inline-block px-2.5 py-1.5 text-xs font-medium rounded-md
            bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800 shadow-sm"
            >
              {t('daysTrial', { days: price.trialPeriodDays as number })}
            </span>
          </div>
        )}

        {/* show features of this plan - in compact mode, smaller text and limited items */}
        <ul
          className={cn(
            'list-outside',
            compact ? 'space-y-1 text-xs' : 'space-y-4 text-sm'
          )}
        >
          {credits?.enable && credits.amount > 0 ? (
            <>
              {/* Dynamic credits features for tier-based plans */}
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
              {/* Remaining static features (skip first two which are credits-related) */}
              {plan.features
                ?.slice(2, compact ? 5 : undefined)
                .map((feature, i) => (
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
            </>
          ) : (
            /* Static features for non-tier plans - limit to 5 in compact mode */
            plan.features
              ?.slice(0, compact ? 5 : undefined)
              .map((feature, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <CheckCircleIcon
                    className={cn(
                      'text-green-500 dark:text-green-400 shrink-0',
                      compact ? 'size-3' : 'size-4'
                    )}
                  />
                  <span>{feature}</span>
                </li>
              ))
          )}
        </ul>

        {/* show limits of this plan - hidden in compact mode */}
        {!compact && (
          <ul className="list-outside space-y-4 text-sm">
            {plan.limits?.map((limit, i) => (
              <li key={i} className="flex items-center gap-2">
                <XCircleIcon className="size-4 text-gray-500 dark:text-gray-400 shrink-0" />
                <span>{limit}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
