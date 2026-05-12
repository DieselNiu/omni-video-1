'use client';

import { useCurrentUser } from '@/hooks/use-current-user';
import { useCurrentPlan } from '@/hooks/use-payment';
import { useInsufficientCreditsDialogStore } from '@/stores/insufficient-credits-dialog-store';
import { UpgradeDialog } from './upgrade-dialog';

/**
 * Insufficient Credits Dialog
 *
 * Delegates to the unified UpgradeDialog. Subscribed users land on the
 * pay-once tab (credit packs); free users land on the yearly subscription tab.
 */
export function InsufficientCreditsDialog() {
  const { isOpen, currentCredits, requiredCredits, closeDialog } =
    useInsufficientCreditsDialogStore();

  const currentUser = useCurrentUser();
  const { data: paymentData } = useCurrentPlan(currentUser?.id);

  const isSubscribed = paymentData?.currentPlan
    ? !paymentData.currentPlan.isFree
    : false;

  return (
    <UpgradeDialog
      open={isOpen}
      onOpenChange={(open) => !open && closeDialog()}
      currentCredits={currentCredits}
      requiredCredits={requiredCredits}
      defaultTab={isSubscribed ? 'pay-once' : 'year'}
    />
  );
}
