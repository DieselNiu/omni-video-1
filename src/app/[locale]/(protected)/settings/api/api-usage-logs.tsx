'use client';

import { getApiUsageAction } from '@/actions/get-api-usage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface UsageLogEntry {
  id: string;
  endpoint: string;
  taskId: string | null;
  status: string;
  creditsDelta: number;
  errorMessage: string | null;
  createdAt: string | Date;
  keyPrefix: string;
}

interface UsagePage {
  items: UsageLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;

function unwrap<T>(result: unknown): T {
  const r = result as
    | {
        data?: T & { success?: boolean; error?: string };
        serverError?: string;
      }
    | undefined;
  if (r?.serverError) {
    throw new Error(r.serverError);
  }
  const data = r?.data;
  if (data && typeof data === 'object' && 'success' in data) {
    const wrapped = data as { success?: boolean; error?: string } & T;
    if (wrapped.success === false) {
      throw new Error(wrapped.error || 'Request failed');
    }
  }
  if (data === undefined || data === null) {
    throw new Error('Empty response');
  }
  return data as T;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'muted'> =
  {
    success: 'success',
    completed: 'success',
    insufficient_credits: 'warning',
    invalid_input: 'warning',
    unauthorized: 'danger',
    provider_error: 'danger',
    failed: 'danger',
    not_found: 'muted',
  };

function statusClasses(status: string): string {
  const tone = STATUS_TONE[status] ?? 'muted';
  switch (tone) {
    case 'success':
      return 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30';
    case 'warning':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
    case 'danger':
      return 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return '-';
  }
  return d.toLocaleString();
}

export function ApiUsageLogs() {
  const t = useTranslations('Dashboard.settings.api');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['api-usage', page],
    queryFn: async () => {
      const result = await getApiUsageAction({ page, pageSize: PAGE_SIZE });
      return unwrap<UsagePage>(result);
    },
    placeholderData: keepPreviousData,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = query.data?.page ?? page;

  const KNOWN_STATUSES = new Set([
    'success',
    'completed',
    'insufficient_credits',
    'invalid_input',
    'unauthorized',
    'provider_error',
    'failed',
    'not_found',
    'processing',
  ]);
  const statusLabel = (status: string) => {
    if (KNOWN_STATUSES.has(status)) {
      return t(`logs.status.${status}` as 'logs.status.success');
    }
    return status;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          {t('logs.title')}
        </CardTitle>
        <CardDescription>{t('logs.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : query.isError ? (
          <p className="py-6 text-sm text-destructive">
            {(query.error as Error)?.message || t('logs.loadError')}
          </p>
        ) : items.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {t('logs.empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('logs.header.time')}</TableHead>
                <TableHead>{t('logs.header.endpoint')}</TableHead>
                <TableHead>{t('logs.header.keyPrefix')}</TableHead>
                <TableHead>{t('logs.header.taskId')}</TableHead>
                <TableHead>{t('logs.header.status')}</TableHead>
                <TableHead className="text-right">
                  {t('logs.header.credits')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(entry.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {entry.endpoint}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {entry.keyPrefix}
                    ****
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {entry.taskId ? (
                      <span title={entry.taskId}>
                        {entry.taskId.length > 12
                          ? `${entry.taskId.slice(0, 8)}…`
                          : entry.taskId}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn('font-normal', statusClasses(entry.status))}
                    >
                      {statusLabel(entry.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {entry.creditsDelta > 0
                      ? `+${entry.creditsDelta}`
                      : entry.creditsDelta}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {total > 0 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted-foreground">
              {t('logs.pageInfo', { page: currentPage, total: totalPages })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || query.isFetching}
              >
                {t('logs.prev')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || query.isFetching}
              >
                {t('logs.next')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
