import VideoHeroSection from '@/components/blocks/hero/video-hero';
import { websiteConfig } from '@/config/website';
import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import dynamic from 'next/dynamic';

const ImageHeroSection = dynamic(
  () => import('@/components/blocks/hero/image-hero')
);
const UseCasesSection = dynamic(
  () => import('@/components/blocks/use-cases/use-cases')
);
const KeyFeatures = dynamic(
  () => import('@/components/blocks/key-features/key-features')
);
const HighlightsSection = dynamic(
  () => import('@/components/blocks/key-features/highlights-section')
);
const UseCasesCardsSection = dynamic(
  () => import('@/components/blocks/key-features/use-cases-cards-section')
);
const HowItWorksSection = dynamic(
  () => import('@/components/blocks/how-it-works/how-it-works')
);
const TestimonialsSection = dynamic(
  () => import('@/components/blocks/testimonials/testimonials')
);
const PricingSection = dynamic(
  () => import('@/components/blocks/pricing/pricing')
);
const FaqSection = dynamic(() => import('@/components/blocks/faqs/faqs'));
const NewsletterCard = dynamic(() =>
  import('@/components/newsletter/newsletter-card').then((m) => ({
    default: m.NewsletterCard,
  }))
);
const CallToActionSection = dynamic(
  () => import('@/components/blocks/calltoaction/calltoaction')
);
const CrispChat = dynamic(() => import('@/components/layout/crisp-chat'));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return constructMetadata({
    title: t('title'),
    description: t('description'),
    locale,
    pathname: '/',
  });
}

interface HomePageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function HomePage(_props: HomePageProps) {
  const isVideoSite = websiteConfig.siteType === 'video';

  return (
    <>
      <div className="flex flex-col">
        {isVideoSite ? <VideoHeroSection /> : <ImageHeroSection />}

        <UseCasesSection />

        <KeyFeatures />

        <HighlightsSection />

        <UseCasesCardsSection />

        <HowItWorksSection />

        <TestimonialsSection />

        <PricingSection />

        <FaqSection />

        <NewsletterCard />

        <CallToActionSection />

        <CrispChat />
      </div>
    </>
  );
}
