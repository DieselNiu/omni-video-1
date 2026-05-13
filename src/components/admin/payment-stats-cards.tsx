'use client';

import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice } from '@/lib/formatter';
import { useTranslations } from 'next-intl';

interface PaymentStatsCardsProps {
  stats?: {
    totalRevenue: number;
    todayRevenue: number;
    currency: string;
  };
  loading?: boolean;
}

export function PaymentStatsCards({ stats, loading }: PaymentStatsCardsProps) {
  const t = useTranslations('Dashboard.admin.payments.stats');

  if (loading) {
    return (
      <div className="mb-6 grid grid-cols-1 gap-4 @xl:grid-cols-2">
        <Card className="@container/card">
          <CardHeader>
            <CardDescription>
              <Skeleton className="h-4 w-24" />
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              <Skeleton className="h-8 w-32" />
            </CardTitle>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="text-muted-foreground">
              <Skeleton className="h-4 w-48" />
            </div>
          </CardFooter>
        </Card>
        <Card className="@container/card">
          <CardHeader>
            <CardDescription>
              <Skeleton className="h-4 w-24" />
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              <Skeleton className="h-8 w-32" />
            </CardTitle>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="text-muted-foreground">
              <Skeleton className="h-4 w-48" />
            </div>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 @xl:grid-cols-2">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>{t('totalRevenue')}</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatPrice(stats.totalRevenue, stats.currency)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-muted-foreground">{t('allTimeDescription')}</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>{t('todayRevenue')}</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatPrice(stats.todayRevenue, stats.currency)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-muted-foreground">{t('todayDescription')}</div>
        </CardFooter>
      </Card>
    </div>
  );
}
