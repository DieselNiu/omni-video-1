import { getUserCreditTransactionsAction } from '@/actions/get-user-credit-transactions';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';

// Query keys
export const userCreditTransactionsKeys = {
  all: ['user-credit-transactions'] as const,
  lists: () => [...userCreditTransactionsKeys.all, 'lists'] as const,
  list: (filters: {
    userId: string;
    pageIndex: number;
    pageSize: number;
    type: string;
    sorting: SortingState;
  }) => [...userCreditTransactionsKeys.lists(), filters] as const,
};

// Hook to fetch user credit transactions with pagination, filtering, and sorting
export function useUserCreditTransactions(
  userId: string,
  pageIndex: number,
  pageSize: number,
  type: string,
  sorting: SortingState
) {
  return useQuery({
    queryKey: userCreditTransactionsKeys.list({
      userId,
      pageIndex,
      pageSize,
      type,
      sorting,
    }),
    queryFn: async () => {
      const result = await getUserCreditTransactionsAction({
        userId,
        pageIndex,
        pageSize,
        type,
        sorting,
      });

      if (!result?.data?.success) {
        console.log('useUserCreditTransactions error:', result?.data?.error);
        throw new Error(
          result?.data?.error || 'Failed to fetch credit transactions'
        );
      }

      return {
        user: result.data.data?.user,
        items: result.data.data?.items || [],
        total: result.data.data?.total || 0,
      };
    },
    placeholderData: keepPreviousData,
    enabled: !!userId,
  });
}
