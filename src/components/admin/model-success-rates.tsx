'use client';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTranslations } from 'next-intl';

interface ModelSuccessRatesProps {
  data?: Array<{
    modelId: string | null;
    channel: string | null;
    total: number;
    succeeded: number;
    failed: number;
    successRate: number;
  }>;
  loading?: boolean;
}

function SkeletonRow() {
  return (
    <TableRow className="h-14">
      {Array.from({ length: 6 }).map((_, i) => (
        <TableCell key={i} className="py-3">
          <Skeleton className="h-4 w-24" />
        </TableCell>
      ))}
    </TableRow>
  );
}

export function ModelSuccessRates({ data, loading }: ModelSuccessRatesProps) {
  const t = useTranslations('Dashboard.admin.generations.modelOverview');

  return (
    <div className="mb-6">
      <h3 className="mb-3 text-lg font-semibold">{t('title')}</h3>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="pl-4">{t('model')}</TableHead>
              <TableHead>{t('channel')}</TableHead>
              <TableHead>{t('requests')}</TableHead>
              <TableHead>{t('succeeded')}</TableHead>
              <TableHead>{t('failed')}</TableHead>
              <TableHead>{t('successRate')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : data && data.length > 0 ? (
              data.map((item) => (
                <TableRow
                  key={`${item.modelId}-${item.channel}`}
                  className="h-14"
                >
                  <TableCell className="pl-4 font-medium">
                    {item.modelId ?? '-'}
                  </TableCell>
                  <TableCell>
                    {item.channel ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        {item.channel}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>{item.total.toLocaleString()}</TableCell>
                  <TableCell>{item.succeeded.toLocaleString()}</TableCell>
                  <TableCell>{item.failed.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.successRate >= 90 ? 'default' : 'destructive'
                      }
                      className={
                        item.successRate >= 90
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : ''
                      }
                    >
                      {item.successRate.toFixed(1)}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  {t('noData')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
