'use client';

import { EFFECTS, type EffectConfig } from '@/effect/config/effects';
import { LocaleLink } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Routes } from '@/routes';
import { ArrowRightIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Coming-soon placeholders. These are not real effects yet — they just
 * reserve visual slots in the grid so the page feels populated while we
 * build out the effect library. Real effects from the `EFFECTS` registry
 * are rendered first, above these.
 */
const PLACEHOLDERS = [
  { id: 'ai-kiss', title: 'AI Kiss' },
  { id: 'y2k-style', title: 'Y2K Style Filter' },
  { id: 'baby-prediction', title: 'Baby Predictor' },
  { id: 'old-photo-revive', title: 'Old Photo Revive' },
  { id: 'anime-me', title: 'Anime Me' },
  { id: 'muscle-mode', title: 'Muscle Mode' },
  { id: 'ghibli-style', title: 'Ghibli Style' },
  { id: 'pixar-style', title: 'Pixar Style' },
  { id: 'time-travel', title: 'Time Travel' },
  { id: 'ai-dance', title: 'AI Dance' },
  { id: 'cartoon-me', title: 'Cartoon Me' },
];

type Props = {
  compact?: boolean;
};

/**
 * A real, clickable effect card backed by an entry in the `EFFECTS`
 * registry.
 */
function RealEffectCard({ effect }: { effect: EffectConfig }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useTranslations(
    `EffectMarketing.${effect.id}.workspace` as any
  ) as (key: string) => string;
  const title = t('title');

  return (
    <LocaleLink
      href={`/effect/${effect.slug}`}
      className={cn(
        'group relative aspect-square overflow-hidden rounded-xl border bg-muted',
        'transition hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
      )}
    >
      {/* Looping preview as cover */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={effect.previewVideoUrl}
        poster={effect.previewPoster}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
      >
        <track kind="captions" />
      </video>

      {/* Title overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3">
        <p className="text-sm font-medium text-white">{title}</p>
      </div>
    </LocaleLink>
  );
}

export function EffectsGrid({ compact = false }: Props) {
  const t = useTranslations('Dashboard.effects');

  const realEffects = Object.values(EFFECTS);

  const visiblePlaceholders = compact
    ? PLACEHOLDERS.slice(0, Math.max(0, 4 - realEffects.length))
    : PLACEHOLDERS;
  const visibleRealEffects = compact ? realEffects.slice(0, 4) : realEffects;

  return (
    <div className="space-y-4">
      {compact && (
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {t('crossLinkTitle')}
            </p>
            <h2 className="text-xl font-semibold md:text-2xl">
              {t('heading')}
            </h2>
          </div>
          <LocaleLink
            href={Routes.Effects}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t('seeAll')}
            <ArrowRightIcon className="size-3.5" />
          </LocaleLink>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {/* Real effects from the registry */}
        {visibleRealEffects.map((effect) => (
          <RealEffectCard key={effect.id} effect={effect} />
        ))}

        {/* Coming-soon placeholders */}
        {visiblePlaceholders.map((p) => (
          <div
            key={p.id}
            className={cn(
              'group relative aspect-square overflow-hidden rounded-xl border bg-muted',
              'transition hover:shadow-lg'
            )}
          >
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              {t('comingSoon')}
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
              <p className="text-sm font-medium text-white">{p.title}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
