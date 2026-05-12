import { claimDailyCheckinAction } from '@/actions/claim-daily-checkin';
import { getDailyCheckinStatusAction } from '@/actions/get-daily-checkin-status';
import { creditsKeys } from '@/hooks/use-credits';
import { trackEvent } from '@/lib/analytics/track';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const checkinKeys = {
  all: ['daily-checkin'] as const,
  status: () => [...checkinKeys.all, 'status'] as const,
};

export function useDailyCheckinStatus(enabled = true) {
  return useQuery({
    queryKey: checkinKeys.status(),
    queryFn: async () => {
      const result = await getDailyCheckinStatusAction();
      if (!result?.data?.success) {
        throw new Error(
          result?.data?.error || 'Failed to fetch daily check-in status'
        );
      }
      return result.data.data;
    },
    enabled,
  });
}

export function useClaimDailyCheckin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await claimDailyCheckinAction();
      if (!result?.data?.success) {
        throw new Error(
          result?.data?.error || 'Failed to claim daily check-in reward'
        );
      }
      return result.data.data;
    },
    onSuccess: (data) => {
      if (data?.alreadyClaimed) {
        trackEvent('daily_checkin_already_claimed', {
          claimedDay: data.claimedDay,
        });
      } else {
        trackEvent('daily_checkin_claimed', {
          claimedDay: data?.claimedDay,
          claimedCount: data?.claimedCount,
          rewardCredits: data?.rewardCredits,
        });
      }

      if (data?.claimedDay === 7) {
        trackEvent('daily_checkin_streak_completed', {
          claimedCount: data?.claimedCount,
        });
      }

      if (data?.isCompleted) {
        trackEvent('daily_checkin_program_completed', {
          claimedCount: data?.claimedCount,
        });
      }

      queryClient.invalidateQueries({ queryKey: checkinKeys.status() });
      queryClient.invalidateQueries({ queryKey: creditsKeys.balance() });
      queryClient.invalidateQueries({ queryKey: creditsKeys.stats() });
    },
  });
}
