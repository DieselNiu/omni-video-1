'use client';

import { UserStatsCards } from '@/components/admin/user-stats-cards';
import { UsersTable } from '@/components/admin/users-table';
import { type PaidStatus, useUsers } from '@/hooks/use-users';
import type { SortingState } from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import {
  createParser,
  parseAsIndex,
  parseAsInteger,
  parseAsString,
  useQueryStates,
} from 'nuqs';
import { useMemo } from 'react';

// Custom parser for paidStatus that only allows valid values
const parseAsPaidStatus = createParser({
  parse: (value: string): PaidStatus => {
    if (value === 'paid' || value === 'free') return value;
    return 'all';
  },
  serialize: (value: PaidStatus) => value,
});

export function UsersPageClient() {
  const t = useTranslations('Dashboard.admin.users');

  const [
    { page, pageSize, search, paidStatus, sortId, sortDesc },
    setQueryStates,
  ] = useQueryStates({
    page: parseAsIndex.withDefault(0), // parseAsIndex adds +1 to URL, so 0-based internally, 1-based in URL
    pageSize: parseAsInteger.withDefault(10),
    search: parseAsString.withDefault(''),
    paidStatus: parseAsPaidStatus.withDefault('all'),
    sortId: parseAsString.withDefault('createdAt'),
    sortDesc: parseAsInteger.withDefault(1),
  });

  const sorting: SortingState = useMemo(
    () => [{ id: sortId, desc: Boolean(sortDesc) }],
    [sortId, sortDesc]
  );

  // page is already 0-based internally thanks to parseAsIndex
  const { data, isLoading } = useUsers(
    page,
    pageSize,
    search,
    paidStatus,
    sorting
  );

  return (
    <>
      <UserStatsCards
        stats={
          data
            ? {
                totalUsers: data.totalUsers,
                todayNewUsers: data.todayNewUsers,
              }
            : undefined
        }
        loading={isLoading}
      />
      <UsersTable
        data={data?.items || []}
        total={data?.total || 0}
        pageIndex={page}
        pageSize={pageSize}
        search={search}
        paidStatus={paidStatus}
        sorting={sorting}
        loading={isLoading}
        onSearch={(newSearch) => setQueryStates({ search: newSearch, page: 0 })}
        onPaidStatusChange={(newPaidStatus) =>
          setQueryStates({ paidStatus: newPaidStatus, page: 0 })
        }
        onPageChange={(newPageIndex) => setQueryStates({ page: newPageIndex })}
        onPageSizeChange={(newPageSize) =>
          setQueryStates({ pageSize: newPageSize, page: 0 })
        }
        onSortingChange={(newSorting) => {
          if (newSorting.length > 0) {
            setQueryStates({
              sortId: newSorting[0].id,
              sortDesc: newSorting[0].desc ? 1 : 0,
            });
          }
        }}
      />
    </>
  );
}
