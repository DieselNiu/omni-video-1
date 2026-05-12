'use client';

import { websiteConfig } from '@/config/website';
import { useCurrentPlan } from '@/hooks/use-payment';
import { authClient } from '@/lib/auth-client';
import { getWatermarkText } from '@/lib/brand';
import { useSubscriptionRequiredDialogStore } from '@/stores/subscription-required-dialog-store';
import { useCallback } from 'react';

/**
 * CSS watermark overlay for video content.
 * Shows the current site brand text for users who have never paid.
 */
export function WatermarkOverlay() {
  if (!websiteConfig.features.enableWatermark) {
    return null;
  }

  const { data: session } = authClient.useSession();
  const { data: paymentData } = useCurrentPlan(session?.user?.id);

  // Only show watermark for users who have never paid
  const hasEverPaid = paymentData?.currentPlan
    ? !paymentData.currentPlan.isFree
    : false;
  if (!paymentData || hasEverPaid) return null;

  return (
    <div className="absolute inset-0 flex items-end justify-center pb-[15%] pointer-events-none z-10">
      <span className="text-white/40 text-2xl font-semibold select-none">
        {getWatermarkText()}
      </span>
    </div>
  );
}

/**
 * Hook that guards video downloads for free users.
 * Returns a wrapper function: if the user has never paid, opens pricing dialog;
 * otherwise calls the original download function.
 */
export function useVideoDownloadGuard() {
  const { data: session } = authClient.useSession();
  const { data: paymentData } = useCurrentPlan(session?.user?.id);
  const { openDialog } = useSubscriptionRequiredDialogStore();

  const isFreeTier = paymentData?.currentPlan
    ? paymentData.currentPlan.isFree
    : true;

  const guardDownload = useCallback(
    (downloadFn: () => void) => {
      if (isFreeTier) {
        openDialog('video_download');
        return;
      }
      downloadFn();
    },
    [isFreeTier, openDialog]
  );

  return { guardDownload, isFreeTier };
}
