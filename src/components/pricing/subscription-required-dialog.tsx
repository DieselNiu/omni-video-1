'use client';

import { useSubscriptionRequiredDialogStore } from '@/stores/subscription-required-dialog-store';
import { UpgradeDialog } from './upgrade-dialog';

/**
 * Subscription Required Dialog
 *
 * Displays when a free user tries to access a premium feature.
 * Delegates to the unified UpgradeDialog.
 */
export function SubscriptionRequiredDialog() {
  const { isOpen, feature, closeDialog } = useSubscriptionRequiredDialogStore();

  return (
    <UpgradeDialog
      open={isOpen}
      onOpenChange={(open) => !open && closeDialog()}
      feature={feature}
    />
  );
}
