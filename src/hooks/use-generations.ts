import {
  getGenerationStatsAction,
  getGenerationsAction,
  getModelSuccessRatesAction,
} from '@/actions/get-generations';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';

// Query keys
export const generationsKeys = {
  all: ['generations'] as const,
  lists: () => [...generationsKeys.all, 'lists'] as const,
  list: (filters: {
    pageIndex: number;
    pageSize: number;
    dateStart: string;
    dateEnd: string;
    modelId: string;
    status: string;
    type: string;
    userId: string;
    channel: string;
    search: string;
    sorting: SortingState;
  }) => [...generationsKeys.lists(), filters] as const,
  stats: (dateStart: string, dateEnd: string) =>
    [...generationsKeys.all, 'stats', dateStart, dateEnd] as const,
  modelRates: (dateStart: string, dateEnd: string) =>
    [...generationsKeys.all, 'model-rates', dateStart, dateEnd] as const,
};

// Hook to fetch generations with pagination, search, filters, and sorting
export function useGenerations(
  pageIndex: number,
  pageSize: number,
  dateStart: string,
  dateEnd: string,
  modelId: string,
  status: string,
  type: string,
  userId: string,
  channel: string,
  search: string,
  sorting: SortingState
) {
  return useQuery({
    queryKey: generationsKeys.list({
      pageIndex,
      pageSize,
      dateStart,
      dateEnd,
      modelId,
      status,
      type,
      userId,
      channel,
      search,
      sorting,
    }),
    queryFn: async () => {
      const result = await getGenerationsAction({
        pageIndex,
        pageSize,
        dateStart,
        dateEnd,
        modelId,
        status,
        type,
        userId,
        channel,
        search,
        sorting,
      });

      if (!result?.data?.success) {
        console.log('useGenerations error:', result?.data?.error);
        throw new Error(result?.data?.error || 'Failed to fetch generations');
      }

      return {
        items: result.data.data?.items || [],
        total: result.data.data?.total || 0,
      };
    },
    placeholderData: keepPreviousData,
  });
}

// Hook to fetch generation statistics with comparison
export function useGenerationStats(dateStart: string, dateEnd: string) {
  return useQuery({
    queryKey: generationsKeys.stats(dateStart, dateEnd),
    queryFn: async () => {
      const result = await getGenerationStatsAction({
        dateStart,
        dateEnd,
      });

      if (!result?.data?.success) {
        console.log('useGenerationStats error:', result?.data?.error);
        throw new Error(
          result?.data?.error || 'Failed to fetch generation statistics'
        );
      }

      return result.data.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}

// Hook to fetch per-model success rates
export function useModelSuccessRates(dateStart: string, dateEnd: string) {
  return useQuery({
    queryKey: generationsKeys.modelRates(dateStart, dateEnd),
    queryFn: async () => {
      const result = await getModelSuccessRatesAction({
        dateStart,
        dateEnd,
      });

      if (!result?.data?.success) {
        console.log('useModelSuccessRates error:', result?.data?.error);
        throw new Error(
          result?.data?.error || 'Failed to fetch model success rates'
        );
      }

      return result.data.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}
