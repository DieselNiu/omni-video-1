import { getPaymentStatsAction } from '@/actions/get-payment-stats';
import { useQuery } from '@tanstack/react-query';

// Query keys
export const paymentStatsKeys = {
  all: ['payment-stats'] as const,
};

// Hook to fetch payment statistics
export function usePaymentStats() {
  return useQuery({
    queryKey: paymentStatsKeys.all,
    queryFn: async () => {
      const result = await getPaymentStatsAction({});

      if (!result?.data?.success) {
        console.log('usePaymentStats error:', result?.data?.error);
        throw new Error(
          result?.data?.error || 'Failed to fetch payment statistics'
        );
      }

      return result.data.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}
