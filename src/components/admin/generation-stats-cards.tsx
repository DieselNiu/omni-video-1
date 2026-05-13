'use client';

import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';

interface GenerationStatsCardsProps {
  stats?: {
    total: number;
    succeeded: number;
    failed: number;
    successRate: number;
    inProgress: number;
    comparison: {
      total: number;
      succeeded: number;
      failed: number;
      successRate: number;
    };
  };
  loading?: boolean;
}

function ComparisonBadge({
  current,
  previous,
  isPercentage,
  lowerIsBetter = false,
}: {
  current: number;
  previous: number;
  isPercentage?: boolean;
  lowerIsBetter?: boolean;
}) {
  const diff = current - previous;
  if (diff === 0 && previous === 0) return null;

  let displayDiff: string;
  if (isPercentage) {
    displayDiff = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
  } else {
    const pct = previous === 0 ? (diff > 0 ? 100 : 0) : (diff / previous) * 100;
    displayDiff = `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`;
  }

  const isPositive = lowerIsBetter ? diff <= 0 : diff >= 0;
  const color = isPositive ? 'text-green-600' : 'text-red-600';

  return <span className={`text-xs font-medium ${color}`}>{displayDiff}</span>;
}

function StatsCardSkeleton() {
  return (
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
  );
}

export function GenerationStatsCards({
  stats,
  loading,
}: GenerationStatsCardsProps) {
  const t = useTranslations('Dashboard.admin.generations.stats');

  if (loading) {
    return (
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const cards = [
    {
      title: t('totalRequests'),
      value: stats.total.toLocaleString(),
      current: stats.total,
      previous: stats.comparison.total,
      isPercentage: false,
    },
    {
      title: t('succeeded'),
      value: stats.succeeded.toLocaleString(),
      current: stats.succeeded,
      previous: stats.comparison.succeeded,
      isPercentage: false,
    },
    {
      title: t('failed'),
      value: stats.failed.toLocaleString(),
      current: stats.failed,
      previous: stats.comparison.failed,
      isPercentage: false,
      lowerIsBetter: true,
    },
    {
      title: t('successRate'),
      value: `${stats.successRate.toFixed(1)}%`,
      current: stats.successRate,
      previous: stats.comparison.successRate,
      isPercentage: true,
    },
    {
      title: t('inProgress'),
      value: stats.inProgress.toLocaleString(),
      current: null,
      previous: null,
      isPercentage: false,
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.title} className="@container/card">
          <CardHeader>
            <CardDescription>{card.title}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {card.value}
            </CardTitle>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="text-muted-foreground">
              {card.current !== null && card.previous !== null ? (
                <ComparisonBadge
                  current={card.current}
                  previous={card.previous}
                  isPercentage={card.isPercentage}
                  lowerIsBetter={'lowerIsBetter' in card && card.lowerIsBetter}
                />
              ) : (
                <span className="text-xs">{t('inProgress')}</span>
              )}
            </div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
