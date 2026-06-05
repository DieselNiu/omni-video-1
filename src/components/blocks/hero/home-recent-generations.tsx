'use client';

import { Badge } from '@/components/ui/badge';
import { LocaleLink } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { HomeRecentGeneration } from '@/stores/home-image-store';
import { AlertTriangle, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface HomeRecentGenerationsProps {
  items: HomeRecentGeneration[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (generation: HomeRecentGeneration) => void;
}

function isFailedStatus(status: string) {
  const normalized = status.toUpperCase();
  return (
    normalized === 'FAILED' ||
    normalized === 'ERROR' ||
    normalized === 'CANCELLED' ||
    normalized.endsWith('_FAILED')
  );
}

function isSuccessfulStatus(status: string) {
  const normalized = status.toUpperCase();
  return (
    normalized === 'COMPLETED' ||
    normalized === 'SAVED_TO_R2' ||
    normalized === 'SUCCEEDED' ||
    normalized === 'SUCCESS'
  );
}

function formatRecentTimestamp(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();

  return new Intl.DateTimeFormat(undefined, {
    month: sameDay ? undefined : 'short',
    day: sameDay ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function HomeRecentGenerations({
  items,
  loading,
  selectedId,
  onSelect,
}: HomeRecentGenerationsProps) {
  const t = useTranslations('HomePage.imageHero');

  return (
    <section className="space-y-3 pt-1">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span className="block text-base font-semibold leading-tight text-foreground">
            {t('recent.title')}
          </span>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {t('recent.subtitle')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <Badge
            variant="outline"
            className="h-7 min-w-7 justify-center rounded-full px-2 text-xs"
          >
            {items.length}
          </Badge>
          <LocaleLink
            href="/assets"
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('recent.viewAll')}
            <ArrowRight className="size-3" />
          </LocaleLink>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`recent-skeleton-${index}`}
              className="aspect-square animate-pulse rounded-2xl border bg-muted/40"
            />
          ))}
        </div>
      ) : null}

      {!loading && items.length === 0 ? (
        <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-muted-foreground/25 bg-muted/20 p-5 text-center">
          <Sparkles className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {t('recent.emptyTitle')}
          </p>
          <p className="max-w-xs text-xs leading-5 text-muted-foreground">
            {t('recent.emptyBody')}
          </p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => {
            const previewUrl =
              item.outputImageUrlsR2[0] ||
              item.outputImageUrls[0] ||
              item.thumbnailUrl;
            const failed = isFailedStatus(item.status);
            const completed = isSuccessfulStatus(item.status);
            const timestamp = formatRecentTimestamp(
              item.completedAt || item.createdAt
            );

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => previewUrl && onSelect(item)}
                disabled={!previewUrl}
                className={cn(
                  'group flex flex-col overflow-hidden rounded-2xl border bg-background text-left transition-all',
                  previewUrl
                    ? 'hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md'
                    : 'cursor-default opacity-80',
                  selectedId === item.id &&
                    'border-foreground/30 shadow-[0_0_0_1px_rgba(15,23,42,0.08)]'
                )}
              >
                <div className="relative aspect-square overflow-hidden bg-muted/40">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={item.prompt || t('recent.itemAlt')}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted/30">
                      {failed ? (
                        <AlertTriangle className="size-5 text-red-500" />
                      ) : (
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  )}

                  {!completed ? (
                    <div className="absolute left-2 top-2">
                      <Badge
                        variant={failed ? 'destructive' : 'secondary'}
                        className="rounded-full px-2 py-0.5 text-[10px]"
                      >
                        {failed ? t('recent.failed') : t('recent.pending')}
                      </Badge>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-1 px-3 py-2.5">
                  <p className="line-clamp-2 text-sm font-medium text-foreground">
                    {item.prompt || t('recent.untitled')}
                  </p>
                  {timestamp ? (
                    <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
                      <span>{timestamp}</span>
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
