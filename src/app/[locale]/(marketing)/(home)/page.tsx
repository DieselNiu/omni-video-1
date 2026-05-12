import CallToActionSection from '@/components/blocks/calltoaction/calltoaction';
import FaqSection from '@/components/blocks/faqs/faqs';
import ImageHeroSection from '@/components/blocks/hero/image-hero';
import VideoHeroSection from '@/components/blocks/hero/video-hero';
import HowItWorksSection from '@/components/blocks/how-it-works/how-it-works';
import HighlightsSection from '@/components/blocks/key-features/highlights-section';
import KeyFeatures from '@/components/blocks/key-features/key-features';
import UseCasesCardsSection from '@/components/blocks/key-features/use-cases-cards-section';
import PricingSection from '@/components/blocks/pricing/pricing';
import TestimonialsSection from '@/components/blocks/testimonials/testimonials';
import UseCasesSection from '@/components/blocks/use-cases/use-cases';
import CrispChat from '@/components/layout/crisp-chat';
import { NewsletterCard } from '@/components/newsletter/newsletter-card';
import { websiteConfig } from '@/config/website';
import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';

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

export default async function HomePage(props: HomePageProps) {
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
