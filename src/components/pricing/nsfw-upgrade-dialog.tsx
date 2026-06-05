'use client';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCurrentUser } from '@/hooks/use-current-user';
import type { PlanInterval } from '@/payment/types';
import { PlanIntervals } from '@/payment/types';
import { XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { getCheckoutData } from './checkout-utils';
import { PaymentCheckoutDialog } from './payment-checkout-dialog';
import {
  UpgradeDialogPricingPanel,
  type UpgradeDialogTab,
} from './upgrade-dialog-pricing-panel';

interface NsfwUpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: 'blocked' | 'moderation';
}

const NSFW_VIDEO_URL = 'https://assets.movart.ai/dance.mp4';

export function NsfwUpgradeDialog({
  open,
  onOpenChange,
  variant = 'blocked',
}: NsfwUpgradeDialogProps) {
  const currentUser = useCurrentUser();
  const t = useTranslations('UpgradeDialog');

  const [tab, setTab] = useState<UpgradeDialogTab>('year');
  const [selectedPlan, setSelectedPlan] = useState<'lite' | 'pro'>('pro');
  const [proTierIndex, setProTierIndex] = useState(0);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const interval: PlanInterval =
    tab === 'month' ? PlanIntervals.MONTH : PlanIntervals.YEAR;
  const checkoutData = getCheckoutData(selectedPlan, proTierIndex, interval);

  const handleBuyNow = () => {
    setCheckoutOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="w-[95vw] max-w-[980px] sm:max-w-[980px] border-none p-0 rounded-2xl bg-transparent overflow-hidden shadow-2xl"
        >
          <DialogHeader className="hidden">
            <DialogTitle />
          </DialogHeader>

          <DialogClose className="absolute top-4 right-4 z-30 rounded-full bg-white/80 p-1.5 text-gray-500 shadow-sm ring-1 ring-black/5 transition-colors hover:bg-white hover:text-gray-950">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogClose>

          <div className="relative flex max-h-[95vh] flex-col-reverse overflow-y-auto bg-gradient-to-br from-white via-[#f8f7ff] to-[#eef3ff] text-gray-950 md:flex-row">
            <div className="relative bg-white/70 p-3 md:w-[38%] md:shrink-0 md:p-4">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.35]"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                }}
              />
              <video
                src={NSFW_VIDEO_URL}
                autoPlay
                muted
                loop
                playsInline
                className="relative h-full min-h-[280px] w-full rounded-xl object-cover shadow-lg ring-1 ring-black/10 md:min-h-0"
              />
            </div>

            <div className="flex-1 p-5 sm:p-7 md:p-8">
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
                title={t(
                  variant === 'moderation' ? 'nsfwModerationTitle' : 'nsfwTitle'
                )}
                subtitle={t(
                  variant === 'moderation'
                    ? 'nsfwModerationSubtitle'
                    : 'nsfwSubtitle'
                )}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {currentUser && (
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
