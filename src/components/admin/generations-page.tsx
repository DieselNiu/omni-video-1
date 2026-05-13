'use client';

import { GenerationStatsCards } from '@/components/admin/generation-stats-cards';
import {
  type GenerationItem,
  GenerationsTable,
} from '@/components/admin/generations-table';
import { ModelSuccessRates } from '@/components/admin/model-success-rates';
import { Button } from '@/components/ui/button';
import {
  useGenerationStats,
  useGenerations,
  useModelSuccessRates,
} from '@/hooks/use-generations';
import type { SortingState } from '@tanstack/react-table';
import { RefreshCwIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  parseAsIndex,
  parseAsInteger,
  parseAsString,
  useQueryStates,
} from 'nuqs';
import { useCallback, useMemo } from 'react';

function getDateRange(preset: string): { start: string; end: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(today);
  end.setDate(end.getDate() + 1);

  switch (preset) {
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: yesterday.toISOString(), end: today.toISOString() };
    }
    case 'last7Days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 7);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'last30Days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    default:
      return { start: today.toISOString(), end: end.toISOString() };
  }
}

const DATE_PRESETS = ['today', 'yesterday', 'last7Days', 'last30Days'] as const;

export function GenerationsPageClient() {
  const t = useTranslations('Dashboard.admin.generations');

  const [queryStates, setQueryStates] = useQueryStates({
    page: parseAsIndex.withDefault(0),
    pageSize: parseAsInteger.withDefault(10),
    search: parseAsString.withDefault(''),
    modelId: parseAsString.withDefault('all'),
    status: parseAsString.withDefault('all'),
    type: parseAsString.withDefault('all'),
    channel: parseAsString.withDefault('all'),
    sortId: parseAsString.withDefault('createdAt'),
    sortDesc: parseAsInteger.withDefault(1),
    dateRange: parseAsString.withDefault('today'),
  });

  const {
    page,
    pageSize,
    search,
    modelId,
    status,
    type,
    channel,
    sortId,
    sortDesc,
    dateRange,
  } = queryStates;

  const sorting: SortingState = useMemo(
    () => [{ id: sortId, desc: Boolean(sortDesc) }],
    [sortId, sortDesc]
  );

  const { start: dateStart, end: dateEnd } = useMemo(
    () => getDateRange(dateRange),
    [dateRange]
  );

  // Convert 'all' to empty string for the API
  const statusFilter = status === 'all' ? '' : status;
  const typeFilter = type === 'all' ? '' : type;
  const channelFilter = channel === 'all' ? '' : channel;
  const modelFilter = modelId === 'all' ? '' : modelId;

  const {
    data: generationsData,
    isLoading: generationsLoading,
    refetch: refetchGenerations,
  } = useGenerations(
    page,
    pageSize,
    dateStart,
    dateEnd,
    modelFilter,
    statusFilter,
    typeFilter,
    '',
    channelFilter,
    search,
    sorting
  );

  const {
    data: statsData,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useGenerationStats(dateStart, dateEnd);

  const {
    data: successRatesData,
    isLoading: successRatesLoading,
    refetch: refetchSuccessRates,
  } = useModelSuccessRates(dateStart, dateEnd);

  const handleRefresh = useCallback(() => {
    refetchGenerations();
    refetchStats();
    refetchSuccessRates();
  }, [refetchGenerations, refetchStats, refetchSuccessRates]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 px-4 lg:px-6">
        <h2 className="text-2xl font-bold">{t('title')}</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border">
            {DATE_PRESETS.map((preset) => (
              <Button
                key={preset}
                variant={dateRange === preset ? 'default' : 'ghost'}
                size="sm"
                className="cursor-pointer rounded-none first:rounded-l-lg last:rounded-r-lg"
                onClick={() => setQueryStates({ dateRange: preset, page: 0 })}
              >
                {t(`dateRange.${preset}`)}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="cursor-pointer min-h-[48px] min-w-[48px]"
            onClick={handleRefresh}
            aria-label="Refresh data"
          >
            <RefreshCwIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="px-4 lg:px-6">
        <GenerationStatsCards stats={statsData} loading={statsLoading} />
        <ModelSuccessRates
          data={successRatesData}
          loading={successRatesLoading}
        />
      </div>

      <GenerationsTable
        data={(generationsData?.items || []) as unknown as GenerationItem[]}
        total={generationsData?.total || 0}
        pageIndex={page}
        pageSize={pageSize}
        search={search}
        modelId={modelId}
        status={status}
        type={type}
        channel={channel}
        sorting={sorting}
        loading={generationsLoading}
        onSearch={(newSearch) => setQueryStates({ search: newSearch, page: 0 })}
        onModelChange={(newModel) =>
          setQueryStates({ modelId: newModel, page: 0 })
        }
        onStatusChange={(newStatus) =>
          setQueryStates({ status: newStatus, page: 0 })
        }
        onTypeChange={(newType) => setQueryStates({ type: newType, page: 0 })}
        onChannelChange={(newChannel) =>
          setQueryStates({ channel: newChannel, page: 0 })
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
