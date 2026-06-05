'use client';

import { Card, CardContent } from '@/components/ui/card';
import { websiteConfig } from '@/config/website';
import { useTranslations } from 'next-intl';
import { IconRenderer } from './icon-renderer';

interface UseCase {
  icon: string;
  title: string;
  description: string;
  tags: string[];
}

const ICON_GRADIENTS = [
  'bg-gradient-to-br from-orange-400 to-orange-600',
  'bg-gradient-to-br from-sky-400 to-blue-600',
  'bg-gradient-to-br from-fuchsia-400 to-purple-600',
  'bg-gradient-to-br from-emerald-400 to-green-600',
  'bg-gradient-to-br from-violet-400 to-purple-600',
  'bg-gradient-to-br from-amber-400 to-orange-500',
];

const CARD_HOVER_TINTS = [
  'before:from-orange-50/80 before:to-orange-100/40 hover:border-orange-200/70 dark:before:from-orange-950/20 dark:before:to-orange-900/10 dark:hover:border-orange-800/30',
  'before:from-sky-50/80 before:to-blue-100/40 hover:border-blue-200/70 dark:before:from-sky-950/20 dark:before:to-blue-900/10 dark:hover:border-blue-800/30',
  'before:from-fuchsia-50/80 before:to-purple-100/40 hover:border-purple-200/70 dark:before:from-fuchsia-950/20 dark:before:to-purple-900/10 dark:hover:border-purple-800/30',
  'before:from-emerald-50/80 before:to-green-100/40 hover:border-emerald-200/70 dark:before:from-emerald-950/20 dark:before:to-green-900/10 dark:hover:border-emerald-800/30',
  'before:from-violet-50/80 before:to-purple-100/40 hover:border-violet-200/70 dark:before:from-violet-950/20 dark:before:to-purple-900/10 dark:hover:border-violet-800/30',
  'before:from-amber-50/80 before:to-orange-100/40 hover:border-amber-200/70 dark:before:from-amber-950/20 dark:before:to-orange-900/10 dark:hover:border-amber-800/30',
];

export default function UseCasesCardsSection() {
  const t = useTranslations('UseCasesCards');
  const contentKey = websiteConfig.siteType === 'video' ? 'video' : 'image';

  const useCases: UseCase[] = [
    {
      icon: t(`${contentKey}.items.item1.icon`),
      title: t(`${contentKey}.items.item1.title`),
      description: t(`${contentKey}.items.item1.description`),
      tags: t.raw(`${contentKey}.items.item1.tags`) as string[],
    },
    {
      icon: t(`${contentKey}.items.item2.icon`),
      title: t(`${contentKey}.items.item2.title`),
      description: t(`${contentKey}.items.item2.description`),
      tags: t.raw(`${contentKey}.items.item2.tags`) as string[],
    },
    {
      icon: t(`${contentKey}.items.item3.icon`),
      title: t(`${contentKey}.items.item3.title`),
      description: t(`${contentKey}.items.item3.description`),
      tags: t.raw(`${contentKey}.items.item3.tags`) as string[],
    },
    {
      icon: t(`${contentKey}.items.item4.icon`),
      title: t(`${contentKey}.items.item4.title`),
      description: t(`${contentKey}.items.item4.description`),
      tags: t.raw(`${contentKey}.items.item4.tags`) as string[],
    },
    {
      icon: t(`${contentKey}.items.item5.icon`),
      title: t(`${contentKey}.items.item5.title`),
      description: t(`${contentKey}.items.item5.description`),
      tags: t.raw(`${contentKey}.items.item5.tags`) as string[],
    },
    {
      icon: t(`${contentKey}.items.item6.icon`),
      title: t(`${contentKey}.items.item6.title`),
      description: t(`${contentKey}.items.item6.description`),
      tags: t.raw(`${contentKey}.items.item6.tags`) as string[],
    },
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <header className="mx-auto mb-16 max-w-4xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
            {t(`${contentKey}.title`)}
          </h2>
          <p className="mt-6 text-base text-muted-foreground md:text-lg">
            {t(`${contentKey}.subtitle`)}
          </p>
        </header>

        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2 lg:grid-cols-3">
          {useCases.map((useCase, index) => (
            <Card
              key={index}
              className={`group relative flex overflow-hidden border border-border/50 bg-card/50 backdrop-blur-sm transition-all before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-br before:opacity-0 before:transition-opacity before:duration-300 hover:shadow-lg hover:shadow-primary/5 hover:before:opacity-100 ${CARD_HOVER_TINTS[index % CARD_HOVER_TINTS.length]}`}
            >
              <CardContent className="relative z-10 flex flex-1 flex-col p-6 md:p-7">
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md ${ICON_GRADIENTS[index % ICON_GRADIENTS.length]}`}
                  >
                    <IconRenderer
                      name={useCase.icon}
                      className="h-5 w-5"
                      strokeWidth={2.25}
                    />
                  </div>
                  <h3 className="text-lg font-semibold text-primary md:text-xl">
                    {useCase.title}
                  </h3>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {useCase.description}
                </p>
                {useCase.tags?.length > 0 && (
                  <div className="mt-auto flex flex-wrap gap-2 pt-6">
                    {useCase.tags.map((tag, tagIndex) => (
                      <span
                        key={`${index}-${tagIndex}-${tag}`}
                        className="rounded-full border border-border/60 bg-background/40 px-3 py-1 text-xs font-medium text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
