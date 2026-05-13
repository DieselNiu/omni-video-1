import { getUsersAction } from '@/actions/get-users';
import { authClient } from '@/lib/auth-client';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';

// Type for paid status filter
export type PaidStatus = 'all' | 'paid' | 'free';

// Query keys
export const usersKeys = {
  all: ['users'] as const,
  lists: () => [...usersKeys.all, 'lists'] as const,
  list: (filters: {
    pageIndex: number;
    pageSize: number;
    search: string;
    paidStatus: PaidStatus;
    sorting: SortingState;
  }) => [...usersKeys.lists(), filters] as const,
};

// Hook to fetch users with pagination, search, and sorting
export function useUsers(
  pageIndex: number,
  pageSize: number,
  search: string,
  paidStatus: PaidStatus,
  sorting: SortingState
) {
  return useQuery({
    queryKey: usersKeys.list({
      pageIndex,
      pageSize,
      search,
      paidStatus,
      sorting,
    }),
    queryFn: async () => {
      const result = await getUsersAction({
        pageIndex,
        pageSize,
        search,
        paidStatus,
        sorting,
      });

      if (!result?.data?.success) {
        console.log('useUsers error:', result?.data?.error);
        throw new Error(result?.data?.error || 'Failed to fetch users');
      }

      return {
        items: result.data.data?.items || [],
        total: result.data.data?.total || 0,
        totalUsers: result.data.data?.totalUsers || 0,
        todayNewUsers: result.data.data?.todayNewUsers || 0,
      };
    },
    placeholderData: keepPreviousData,
  });
}

// Hook to ban user
export function useBanUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      banReason,
      banExpiresIn,
    }: {
      userId: string;
      banReason: string;
      banExpiresIn?: number;
    }) => {
      console.log('useBanUser, userId:', userId);
      return authClient.admin.banUser({
        userId,
        banReason,
        banExpiresIn,
      });
    },
    onSuccess: () => {
      // Invalidate all users queries to refresh the data
      queryClient.invalidateQueries({
        queryKey: usersKeys.all,
      });
    },
  });
}

// Hook to unban user
export function useUnbanUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      console.log('useUnbanUser, userId:', userId);
      return authClient.admin.unbanUser({
        userId,
      });
    },
    onSuccess: () => {
      // Invalidate all users queries to refresh the data
      queryClient.invalidateQueries({
        queryKey: usersKeys.all,
      });
    },
  });
}
