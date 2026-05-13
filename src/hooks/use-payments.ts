import { getPaymentsAction } from '@/actions/get-payments';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';

// Query keys
export const paymentsKeys = {
  all: ['payments'] as const,
  lists: () => [...paymentsKeys.all, 'lists'] as const,
  list: (filters: {
    pageIndex: number;
    pageSize: number;
    search: string;
    status: string;
    type: string;
    scene: string;
    provider: string;
    sorting: SortingState;
  }) => [...paymentsKeys.lists(), filters] as const,
};

// Hook to fetch payments with pagination, search, filters, and sorting
export function usePayments(
  pageIndex: number,
  pageSize: number,
  search: string,
  status: string,
  type: string,
  scene: string,
  provider: string,
  sorting: SortingState
) {
  return useQuery({
    queryKey: paymentsKeys.list({
      pageIndex,
      pageSize,
      search,
      status,
      type,
      scene,
      provider,
      sorting,
    }),
    queryFn: async () => {
      const result = await getPaymentsAction({
        pageIndex,
        pageSize,
        search,
        status,
        type,
        scene,
        provider,
        sorting,
      });

      if (!result?.data?.success) {
        console.log('usePayments error:', result?.data?.error);
        throw new Error(result?.data?.error || 'Failed to fetch payments');
      }

      return {
        items: result.data.data?.items || [],
        total: result.data.data?.total || 0,
      };
    },
    placeholderData: keepPreviousData,
  });
}
