'use client';

import { HeaderSection } from '@/components/layout/header-section';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { websiteConfig } from '@/config/website';
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

interface FaqSectionProps {
  data?: FaqData;
  centerTitle?: boolean;
}

export default function FaqSection({ data }: FaqSectionProps = {}) {
  const t = useTranslations('HomePage.faqs');
  const contentKey = websiteConfig.siteType === 'video' ? 'video' : 'image';

  const title = data?.title ?? t(`${contentKey}.title`);
  const faqItems: FAQItem[] = data
    ? data.items
    : [
        {
          id: 'item-1',
          icon: 'calendar-clock',
          question: t(`${contentKey}.items.item-1.question`),
          answer: t(`${contentKey}.items.item-1.answer`),
        },
        {
          id: 'item-2',
          icon: 'wallet',
          question: t(`${contentKey}.items.item-2.question`),
          answer: t(`${contentKey}.items.item-2.answer`),
        },
        {
          id: 'item-3',
          icon: 'refresh-cw',
          question: t(`${contentKey}.items.item-3.question`),
          answer: t(`${contentKey}.items.item-3.answer`),
        },
        {
          id: 'item-4',
          icon: 'hand-coins',
          question: t(`${contentKey}.items.item-4.question`),
          answer: t(`${contentKey}.items.item-4.answer`),
        },
        {
          id: 'item-5',
          icon: 'mail',
          question: t(`${contentKey}.items.item-5.question`),
          answer: t(`${contentKey}.items.item-5.answer`),
        },
      ];

  return (
    <section id="faqs" className="px-4 py-16">
      <div className="mx-auto max-w-4xl">
        <HeaderSection
          title={title}
          titleAs="h2"
          className="items-center text-center"
          titleClassName="text-3xl md:text-4xl lg:text-5xl font-bold text-black dark:text-white"
        />

        <div className="mx-auto max-w-4xl mt-12">
          <Accordion type="single" collapsible className="w-full">
            {faqItems.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="border-b border-border"
              >
                <AccordionTrigger className="cursor-pointer text-base hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-base text-muted-foreground">
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
