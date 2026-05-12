'use client';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreditPackages } from '@/config/credits-config';
import { websiteConfig } from '@/config/website';
import { useCurrentUser } from '@/hooks/use-current-user';
import { cn } from '@/lib/utils';
import type { PlanInterval } from '@/payment/types';
import { PlanIntervals } from '@/payment/types';
import { XIcon } from 'lucide-react';
import { useState } from 'react';
import { PaymentCheckoutDialog } from './payment-checkout-dialog';
import { UpgradeDialogFeaturesPanel } from './upgrade-dialog-features-panel';
import {
  UpgradeDialogPricingPanel,
  type UpgradeDialogTab,
} from './upgrade-dialog-pricing-panel';

export type UpgradeDialogTrigger =
  | 'cooldown_hit'
  | 'credits_depleted'
  | 'purchase_required'
  | 'login_modal_upgrade'
  | 'sidebar'
  | 'nsfw_block'
  | 'preview_remove_watermark'
  | 'manual';

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCredits?: number;
  requiredCredits?: number;
  feature?: string;
  trigger?: UpgradeDialogTrigger;
  defaultTab?: UpgradeDialogTab;
}

function tabToInterval(tab: UpgradeDialogTab): PlanInterval {
  return tab === 'month' ? PlanIntervals.MONTH : PlanIntervals.YEAR;
}

function getCheckoutData(
  selectedPlan: 'lite' | 'pro',
  proTierIndex: number,
  interval: PlanInterval
) {
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
      credits: (price?.credits ?? plan.credits)?.amount ?? 0,
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

export function UpgradeDialog({
  open,
  onOpenChange,
  defaultTab = 'year',
}: UpgradeDialogProps) {
  const currentUser = useCurrentUser();
  const allPackages = useCreditPackages();
  const packageList = Object.values(allPackages).filter(
    (pkg) => !pkg.disabled && pkg.price.priceId
  );

  const [tab, setTab] = useState<UpgradeDialogTab>(defaultTab);
  const [selectedPlan, setSelectedPlan] = useState<'lite' | 'pro'>('pro');
  const [proTierIndex, setProTierIndex] = useState(0);
  const [selectedPackageId, setSelectedPackageId] = useState<string>(
    packageList[0]?.id ?? ''
  );
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const interval = tabToInterval(tab);
  const isPayOnce = tab === 'pay-once';
  const selectedPackage =
    packageList.find((p) => p.id === selectedPackageId) ?? packageList[0];
  const [mobileView, setMobileView] = useState<'pricing' | 'features'>(
    'pricing'
  );

  const checkoutData = getCheckoutData(selectedPlan, proTierIndex, interval);

  const handleBuyNow = () => {
    setCheckoutOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          className="w-[95vw] max-w-[960px] sm:max-w-[960px] border-none p-0 rounded-2xl bg-transparent overflow-hidden"
        >
          <DialogHeader className="hidden">
            <DialogTitle />
          </DialogHeader>

          <DialogClose className="absolute top-4 right-4 z-30 text-gray-400 hover:text-white transition-colors">
            <XIcon className="size-5" />
            <span className="sr-only">Close</span>
          </DialogClose>

          <div className="relative flex flex-col md:flex-row bg-[#0D0D0D] text-white overflow-y-auto max-h-[95vh]">
            <div className="md:hidden sticky top-0 z-20 bg-[#0D0D0D] pl-4 pr-16 pt-4 pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-1 rounded-full bg-white/[0.06] p-1">
                <button
                  type="button"
                  onClick={() => setMobileView('pricing')}
                  aria-pressed={mobileView === 'pricing'}
                  className={cn(
                    'flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors cursor-pointer',
                    mobileView === 'pricing'
                      ? 'bg-white/15 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  )}
                >
                  Plans
                </button>
                <button
                  type="button"
                  onClick={() => setMobileView('features')}
                  aria-pressed={mobileView === 'features'}
                  className={cn(
                    'flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors cursor-pointer',
                    mobileView === 'features'
                      ? 'bg-white/15 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  )}
                >
                  Features
                </button>
              </div>
            </div>

            <div
              className={cn(
                'flex-1 p-6 sm:p-8 order-2 md:order-2',
                mobileView !== 'pricing' && 'hidden md:block'
              )}
            >
              <UpgradeDialogPricingPanel
                tab={tab}
                onTabChange={setTab}
                selectedPlan={selectedPlan}
                onSelectedPlanChange={setSelectedPlan}
                proTierIndex={proTierIndex}
                showSliderHint={open}
                onProTierIndexChange={setProTierIndex}
                selectedPackageId={selectedPackageId}
                onSelectedPackageIdChange={setSelectedPackageId}
                onBuyNow={handleBuyNow}
                isLoggedIn={!!currentUser}
              />
            </div>

            <div
              className={cn(
                'md:w-[38%] md:shrink-0 relative bg-[#1A1A1A] md:rounded-r-2xl p-6 sm:p-8 overflow-hidden order-1 md:order-1',
                mobileView !== 'features' && 'hidden md:block'
              )}
            >
              <div
                className="absolute inset-0 opacity-[0.04] pointer-events-none"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                }}
              />
              <div className="relative">
                <UpgradeDialogFeaturesPanel
                  selectedPlan={selectedPlan}
                  proTierIndex={proTierIndex}
                  credits={checkoutData.credits}
                  interval={interval}
                  showNanoFamily={false}
                  payOnce={
                    isPayOnce && selectedPackage
                      ? { credits: selectedPackage.amount }
                      : undefined
                  }
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {currentUser && isPayOnce && selectedPackage && (
        <PaymentCheckoutDialog
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          userId={currentUser.id}
          planId=""
          priceId={selectedPackage.price.priceId}
          planName={`${selectedPackage.amount.toLocaleString()} Credits`}
          price={selectedPackage.price.amount}
          currency="usd"
          credits={selectedPackage.amount}
          mode="payment"
          packageId={selectedPackage.id}
          onSuccess={() => setCheckoutOpen(false)}
        />
      )}
      {currentUser && !isPayOnce && (
        <PaymentCheckoutDialog
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          userId={currentUser.id}
          planId={checkoutData.planId}
          priceId={checkoutData.priceId}
          planName={checkoutData.planName}
          price={checkoutData.price}
          currency={checkoutData.currency}
          interval={checkoutData.interval}
          credits={checkoutData.credits}
          mode="subscription"
        />
      )}
    </>
  );
}
