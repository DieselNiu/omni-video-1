'use client';

import { PaymentStatsCards } from '@/components/admin/payment-stats-cards';
import {
  type PaymentItem,
  PaymentsTable,
} from '@/components/admin/payments-table';
import { usePaymentStats } from '@/hooks/use-payment-stats';
import { usePayments } from '@/hooks/use-payments';
import type { SortingState } from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import {
  parseAsIndex,
  parseAsInteger,
  parseAsString,
  useQueryStates,
} from 'nuqs';
import { useMemo } from 'react';

export function PaymentsPageClient() {
  const t = useTranslations('Dashboard.admin.payments');

  const [
    { page, pageSize, search, status, type, scene, provider, sortId, sortDesc },
    setQueryStates,
  ] = useQueryStates({
    page: parseAsIndex.withDefault(0),
    pageSize: parseAsInteger.withDefault(10),
    search: parseAsString.withDefault(''),
    status: parseAsString.withDefault('all'),
    type: parseAsString.withDefault('all'),
    scene: parseAsString.withDefault('all'),
    provider: parseAsString.withDefault('all'),
    sortId: parseAsString.withDefault('createdAt'),
    sortDesc: parseAsInteger.withDefault(1),
  });

  const sorting: SortingState = useMemo(
    () => [{ id: sortId, desc: Boolean(sortDesc) }],
    [sortId, sortDesc]
  );

  // Convert 'all' to empty string for the API
  const statusFilter = status === 'all' ? '' : status;
  const typeFilter = type === 'all' ? '' : type;
  const sceneFilter = scene === 'all' ? '' : scene;
  const providerFilter = provider === 'all' ? '' : provider;

  const { data, isLoading } = usePayments(
    page,
    pageSize,
    search,
    statusFilter,
    typeFilter,
    sceneFilter,
    providerFilter,
    sorting
  );

  const { data: stats, isLoading: statsLoading } = usePaymentStats();

  return (
    <>
      <PaymentStatsCards stats={stats} loading={statsLoading} />
      <PaymentsTable
        data={(data?.items || []) as PaymentItem[]}
        total={data?.total || 0}
        pageIndex={page}
        pageSize={pageSize}
        search={search}
        status={status}
        type={type}
        scene={scene}
        provider={provider}
        sorting={sorting}
        loading={isLoading}
        onSearch={(newSearch) => setQueryStates({ search: newSearch, page: 0 })}
        onStatusChange={(newStatus) =>
          setQueryStates({ status: newStatus, page: 0 })
        }
        onTypeChange={(newType) => setQueryStates({ type: newType, page: 0 })}
        onSceneChange={(newScene) =>
          setQueryStates({ scene: newScene, page: 0 })
        }
        onProviderChange={(newProvider) =>
          setQueryStates({ provider: newProvider, page: 0 })
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
