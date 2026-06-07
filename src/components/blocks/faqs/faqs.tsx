'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { websiteConfig } from '@/config/website';
import { cn } from '@/lib/utils';
import type { IconName } from 'lucide-react/dynamic';
import { useTranslations } from 'next-intl';

type FAQItem = {
  id: string;
  icon?: IconName;
  question: string;
  answer: string;
};

type FaqData = {
  title: string;
  items: { id: string; question: string; answer: string }[];
};

type RawFaqItems = Record<string, { question: string; answer: string }>;

interface FaqSectionProps {
  data?: FaqData;
  centerTitle?: boolean;
  variant?: 'default' | 'pricing';
}

export default function FaqSection({
  data,
  centerTitle = false,
  variant = 'default',
}: FaqSectionProps = {}) {
  const t = useTranslations('HomePage.faqs');
  const contentKey = websiteConfig.siteType === 'video' ? 'video' : 'image';
  const isPricing = variant === 'pricing';
  const rawTranslations = t.raw as (key: string) => unknown;

  const title = data?.title ?? t(`${contentKey}.title`);
  const faqItems: FAQItem[] = data
    ? data.items
    : Object.entries(rawTranslations(`${contentKey}.items`) as RawFaqItems)
        .sort(([a], [b]) => {
          const aIndex = Number(a.replace('item-', ''));
          const bIndex = Number(b.replace('item-', ''));
          return aIndex - bIndex;
        })
        .map(([id, item]) => ({
          id,
          question: item.question,
          answer: item.answer,
        }));

  return (
    <section
      id="faqs"
      className={cn(
        'relative bg-white px-4',
        isPricing ? 'pt-24 pb-16 md:pt-28 md:pb-20' : 'pt-20 pb-10'
      )}
    >
      <div className="relative mx-auto">
        <div
          className={cn(
            'mx-auto max-w-[992px]',
            centerTitle || isPricing ? 'text-center' : 'text-left'
          )}
        >
          <h2
            className={cn(
              'mb-3 text-slate-950 dark:text-white',
              isPricing
                ? 'text-[34px] font-medium leading-[1.25] tracking-normal sm:text-4xl md:mb-12'
                : 'text-2xl font-bold tracking-[-0.48px] sm:text-3xl md:mb-4 md:text-5xl md:leading-[1.125] md:tracking-[-0.96px]'
            )}
          >
            {title}
          </h2>
        </div>

        <div
          className={cn(
            'mx-auto mb-8',
            isPricing ? 'max-w-[780px]' : 'max-w-[960px]',
            isPricing ? 'mt-8 md:mt-0' : 'mt-8 md:mt-12 md:mb-12'
          )}
        >
          <Accordion
            type="single"
            collapsible
            defaultValue={isPricing ? undefined : faqItems[0]?.id}
            className={cn('w-full', isPricing && 'space-y-6')}
          >
            {faqItems.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className={cn(
                  isPricing
                    ? 'overflow-hidden rounded-[18px] border border-neutral-200 bg-white shadow-[0_12px_24px_rgba(15,23,42,0.08)] last:border-b'
                    : 'border-gray-100 py-8'
                )}
              >
                <AccordionTrigger
                  className={cn(
                    'cursor-pointer text-left font-semibold hover:no-underline',
                    isPricing
                      ? 'items-center px-7 py-8 text-[21px] leading-[1.25] text-neutral-950 sm:px-10 sm:py-10 sm:text-[26px] [&>svg]:size-6 [&>svg]:text-neutral-950'
                      : 'px-6 py-0 text-base md:text-lg'
                  )}
                >
                  {item.question}
                </AccordionTrigger>
                <AccordionContent
                  className={cn(
                    isPricing
                      ? 'px-7 pt-0 pb-8 sm:px-10 sm:pb-10'
                      : 'px-6 pt-5 pb-0'
                  )}
                >
                  <p
                    className={cn(
                      isPricing
                        ? 'max-w-[820px] text-base font-normal leading-7 tracking-normal text-neutral-600 sm:text-lg'
                        : 'text-lg font-medium leading-7 tracking-[-0.18px] text-neutral-500'
                    )}
                  >
                    {item.answer}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {!data && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            {t(`${contentKey}.contact`)}{' '}
            <a
              href={`mailto:${t(`${contentKey}.contactEmail`)}`}
              className="text-primary underline underline-offset-4 hover:text-primary/80"
            >
              {t(`${contentKey}.contactEmail`)}
            </a>
          </p>
        )}
      </div>
    </section>
  );
}
