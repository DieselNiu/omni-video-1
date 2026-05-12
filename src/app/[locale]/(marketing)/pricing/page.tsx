import FaqSection from '@/components/blocks/faqs/faqs';
import Container from '@/components/layout/container';
import { PaymentMethods } from '@/components/pricing/payment-methods';
import { PricingTable } from '@/components/pricing/pricing-table';
import { getTranslations } from 'next-intl/server';

export default async function PricingPage() {
  const t = await getTranslations('PricingPage.faq');

  const faqData = {
    title: t('title'),
    items: [
      {
        id: 'item-1',
        question: t('items.item-1.question'),
        answer: t('items.item-1.answer'),
      },
      {
        id: 'item-2',
        question: t('items.item-2.question'),
        answer: t('items.item-2.answer'),
      },
      {
        id: 'item-3',
        question: t('items.item-3.question'),
        answer: t('items.item-3.answer'),
      },
      {
        id: 'item-4',
        question: t('items.item-4.question'),
        answer: t('items.item-4.answer'),
      },
      {
        id: 'item-5',
        question: t('items.item-5.question'),
        answer: t('items.item-5.answer'),
      },
      {
        id: 'item-6',
        question: t('items.item-6.question'),
        answer: t('items.item-6.answer'),
      },
      {
        id: 'item-7',
        question: t('items.item-7.question'),
        answer: t('items.item-7.answer'),
      },
      {
        id: 'item-8',
        question: t('items.item-8.question'),
        answer: t('items.item-8.answer'),
      },
      {
        id: 'item-9',
        question: t('items.item-9.question'),
        answer: t('items.item-9.answer'),
      },
    ],
  };

  return (
    <>
      <Container className="mt-8 max-w-6xl px-4 flex flex-col gap-12">
        <PricingTable />
        <PaymentMethods />
      </Container>
      <FaqSection data={faqData} centerTitle={true} />
    </>
  );
}
