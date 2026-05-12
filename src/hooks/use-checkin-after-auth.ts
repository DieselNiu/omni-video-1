'use client';

import { claimDailyCheckinAction } from '@/actions/claim-daily-checkin';
import { creditsKeys } from '@/hooks/use-credits';
import { checkinKeys } from '@/hooks/use-daily-checkin';
import { trackEvent } from '@/lib/analytics/track';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from 'sonner';

interface UseCheckinAfterAuthOptions {
  source: string;
}

/**
 * Unified "claim daily check-in + toast + query refresh" logic.
 * Eliminates duplication across daily-checkin-dialog and use-auto-checkin-after-login.
 */
export function useCheckinAfterAuth({ source }: UseCheckinAfterAuthOptions) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const claimAndNotify = useCallback(async () => {
    try {
      const result = await claimDailyCheckinAction();

      if (result?.data?.success && result.data.data) {
        const data = result.data.data;
        if (!data.alreadyClaimed) {
          toast.success(
            `Check-in successful! You earned ${data.rewardCredits} credits.`
          );
          trackEvent('daily_checkin_claimed', {
            claimedDay: data.claimedDay,
            claimedCount: data.claimedCount,
            rewardCredits: data.rewardCredits,
            source,
          });
        } else {
          toast.success('Login successful');
        }
      } else {
        toast.success('Login successful');
      }
    } catch {
      toast.success('Login successful');
    }

    // Invalidate checkin & credits queries to refresh UI
    queryClient.invalidateQueries({ queryKey: checkinKeys.status() });
    queryClient.invalidateQueries({ queryKey: creditsKeys.balance() });
    queryClient.invalidateQueries({ queryKey: creditsKeys.stats() });

    // Force Next.js to re-render server components (navbar etc.)
    router.refresh();
  }, [queryClient, router, source]);

  return { claimAndNotify };
}
