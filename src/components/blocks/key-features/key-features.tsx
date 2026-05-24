'use client';

import { Button } from '@/components/ui/button';
import { websiteConfig } from '@/config/website';
import { cn } from '@/lib/utils';
import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useState } from 'react';
import { MarketingVideo } from './marketing-video';

interface FeatureTab {
  id: string;
  label: string;
  title: string;
  tagline: string;
  description: string;
  media: string;
  mediaType: 'image' | 'video';
  poster?: string;
  ctaText: string;
}

export default function KeyFeatures() {
  const t = useTranslations('KeyFeatures');
  const contentKey = websiteConfig.siteType === 'video' ? 'video' : 'image';
  const [activeTab, setActiveTab] = useState('tab-1');

  const tabs: FeatureTab[] = [
    {
      id: 'tab-1',
      label: t(`${contentKey}.tabs.tab1.label`),
      title: t(`${contentKey}.tabs.tab1.title`),
      tagline: t(`${contentKey}.tabs.tab1.tagline`),
      description: t(`${contentKey}.tabs.tab1.description`),
      media:
        contentKey === 'video'
          ? 'https://assets.gemini-omni.video/world-understanding.mp4'
          : 'https://assets.gemini-omni.video/gptimage/landingpage/gpt-image-2-text-accuracy.png',
      mediaType: contentKey === 'video' ? 'video' : 'image',
      poster:
        contentKey === 'video'
          ? 'https://assets.gemini-omni.video/world-understanding.jpg'
          : undefined,
      ctaText: t(`${contentKey}.tabs.tab1.cta`),
    },
    {
      id: 'tab-2',
      label: t(`${contentKey}.tabs.tab2.label`),
      title: t(`${contentKey}.tabs.tab2.title`),
      tagline: t(`${contentKey}.tabs.tab2.tagline`),
      description: t(`${contentKey}.tabs.tab2.description`),
      media:
        contentKey === 'video'
          ? 'https://assets.gemini-omni.video/reference-anying.mp4'
          : 'https://assets.gemini-omni.video/gptimage/landingpage/gpt-image-2-example-17.jpeg',
      mediaType: contentKey === 'video' ? 'video' : 'image',
      poster:
        contentKey === 'video'
          ? 'https://assets.gemini-omni.video/reference-anying.jpg'
          : undefined,
      ctaText: t(`${contentKey}.tabs.tab2.cta`),
    },
    {
      id: 'tab-3',
      label: t(`${contentKey}.tabs.tab3.label`),
      title: t(`${contentKey}.tabs.tab3.title`),
      tagline: t(`${contentKey}.tabs.tab3.tagline`),
      description: t(`${contentKey}.tabs.tab3.description`),
      media:
        contentKey === 'video'
          ? 'https://assets.gemini-omni.video/con-editing.mp4'
          : 'https://assets.gemini-omni.video/gptimage/landingpage/gpt-image-2-example-14.jpeg',
      mediaType: contentKey === 'video' ? 'video' : 'image',
      poster:
        contentKey === 'video'
          ? 'https://assets.gemini-omni.video/con-editing.jpg'
          : undefined,
      ctaText: t(`${contentKey}.tabs.tab3.cta`),
    },
    {
      id: 'tab-4',
      label: t(`${contentKey}.tabs.tab4.label`),
      title: t(`${contentKey}.tabs.tab4.title`),
      tagline: t(`${contentKey}.tabs.tab4.tagline`),
      description: t(`${contentKey}.tabs.tab4.description`),
      media:
        contentKey === 'video'
          ? 'https://assets.gemini-omni.video/gallery/18.mp4'
          : 'https://assets.gemini-omni.video/gptimage/landingpage/gpt-image-2-example-10.jpeg',
      mediaType: contentKey === 'video' ? 'video' : 'image',
      poster:
        contentKey === 'video'
          ? 'https://assets.gemini-omni.video/gallery/18.webp'
          : undefined,
      ctaText: t(`${contentKey}.tabs.tab4.cta`),
    },
  ];

  const activeFeature = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  const scrollToHero = () => {
    document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative overflow-hidden py-20 md:py-32">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent" />

      <div className="container relative mx-auto px-4">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-4xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
            {t(`${contentKey}.title`)}
          </h2>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground md:text-lg">
            {t(`${contentKey}.subtitle`)}
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-12 flex justify-center">
          <div className="inline-flex flex-wrap items-center justify-center gap-1 md:gap-2">
            {tabs.map((tab) => (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative px-4 py-3 text-sm font-medium transition-all duration-300 md:px-6 md:text-base',
                  activeTab === tab.id
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground/80'
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    'absolute bottom-0 left-0 h-0.5 w-full origin-center scale-x-0 bg-primary transition-transform duration-300',
                    activeTab === tab.id && 'scale-x-100'
                  )}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="mx-auto max-w-5xl">
          <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12 lg:gap-16">
            {/* Left: Media */}
            <div className="order-2 md:order-1">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border/50 bg-card shadow-2xl">
                {activeFeature.mediaType === 'video' ? (
                  <MarketingVideo
                    key={activeFeature.id}
                    src={activeFeature.media}
                    poster={activeFeature.poster}
                  />
                ) : (
                  <Image
                    key={activeFeature.id}
                    src={activeFeature.media}
                    alt={activeFeature.title}
                    fill
                    sizes="(min-width: 1024px) 600px, (min-width: 768px) 50vw, 100vw"
                    className="object-contain p-3 transition-opacity duration-500"
                  />
                )}
              </div>
            </div>

            {/* Right: Content */}
            <div className="order-1 md:order-2">
              <h3 className="text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
                {activeFeature.title}
              </h3>
              <p className="mt-4 bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-lg font-semibold text-transparent md:text-xl">
                {activeFeature.tagline}
              </p>
              <p className="mt-6 text-base leading-relaxed text-muted-foreground md:text-lg">
                {activeFeature.description}
              </p>
              <div className="mt-8">
                <Button
                  size="lg"
                  onClick={scrollToHero}
                  className="gap-2 rounded-full px-8 font-medium"
                >
                  {activeFeature.ctaText}
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
