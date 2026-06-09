'use client';

import { websiteConfig } from '@/config/website';
import { useIntersectionObserver } from '@/hooks/use-intersection-observer';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { MarketingVideo } from './marketing-video';

interface Highlight {
  media: string;
  mediaType: 'image' | 'video';
  poster?: string;
  title: string;
  description: string;
  ctaText: string;
  ctaLink: string;
}

function HighlightMedia({ highlight }: { highlight: Highlight }) {
  const { ref, isVisible } = useIntersectionObserver('200px');
  const isVideo = highlight.mediaType === 'video';

  return (
    <div ref={ref} className="relative aspect-[4/3] overflow-hidden rounded-lg">
      {isVideo && isVisible ? (
        <MarketingVideo src={highlight.media} poster={highlight.poster} />
      ) : isVideo && highlight.poster ? (
        <Image
          src={highlight.poster}
          alt={highlight.title}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
        />
      ) : !isVideo ? (
        <Image
          src={highlight.media}
          alt={highlight.title}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-contain p-3"
        />
      ) : (
        <div className="h-full w-full bg-muted" />
      )}
    </div>
  );
}

export default function HighlightsSection() {
  const t = useTranslations('Highlights');
  const contentKey = websiteConfig.siteType === 'video' ? 'video' : 'image';

  const highlights: Highlight[] = [
    {
      media:
        contentKey === 'video'
          ? 'https://assets.gemini-omni.video/landingpage/cinematic-realism-20260605.mp4'
          : 'https://assets.gemini-omni.video/gptimage/landingpage/gpt-image-2-example-01.jpeg',
      mediaType: contentKey === 'video' ? 'video' : 'image',
      poster:
        contentKey === 'video'
          ? 'https://assets.gemini-omni.video/landingpage/cinematic-realism-20260605-poster.webp'
          : undefined,
      title: t(`${contentKey}.items.item1.title`),
      description: t(`${contentKey}.items.item1.description`),
      ctaText: t(`${contentKey}.items.item1.cta`),
      ctaLink: '#hero',
    },
    {
      media:
        contentKey === 'video'
          ? 'https://assets.gemini-omni.video/landingpage/multimodal-references-20260605-opt.mp4'
          : 'https://assets.gemini-omni.video/gptimage/landingpage/gpt-image-2-example-11.jpeg',
      mediaType: contentKey === 'video' ? 'video' : 'image',
      poster:
        contentKey === 'video'
          ? 'https://assets.gemini-omni.video/landingpage/multimodal-references-20260605-poster.webp'
          : undefined,
      title: t(`${contentKey}.items.item2.title`),
      description: t(`${contentKey}.items.item2.description`),
      ctaText: t(`${contentKey}.items.item2.cta`),
      ctaLink: '#hero',
    },
    {
      media:
        contentKey === 'video'
          ? 'https://assets.gemini-omni.video/landingpage/reference-guided-generation-20260605.mp4'
          : 'https://assets.gemini-omni.video/gptimage/landingpage/gpt-image-2-example-02.jpeg',
      mediaType: contentKey === 'video' ? 'video' : 'image',
      poster:
        contentKey === 'video'
          ? 'https://assets.gemini-omni.video/landingpage/reference-guided-generation-20260605-poster.webp'
          : undefined,
      title: t(`${contentKey}.items.item3.title`),
      description: t(`${contentKey}.items.item3.description`),
      ctaText: t(`${contentKey}.items.item3.cta`),
      ctaLink: '#hero',
    },
  ];

  return (
    <section className="bg-[#fafafa] py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            {t(`${contentKey}.title`)}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t(`${contentKey}.subtitle`)}
          </p>
        </div>

        <div className="mx-auto max-w-5xl space-y-12 md:space-y-16">
          {highlights.map((highlight, index) => (
            <div
              key={index}
              className={`flex flex-col items-center gap-6 md:gap-10 ${
                index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
              }`}
            >
              <div className="w-full md:w-1/2">
                <HighlightMedia highlight={highlight} />
              </div>

              <div className="w-full md:w-1/2">
                <h3 className="bg-gradient-to-r from-primary to-pink-300 bg-clip-text text-lg font-bold text-transparent sm:text-xl md:text-2xl lg:text-3xl">
                  {highlight.title}
                </h3>
                <p className="mt-4 text-muted-foreground md:text-lg">
                  {highlight.description}
                </p>
                {highlight.ctaText && (
                  <Link
                    href={highlight.ctaLink}
                    className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary px-6 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    {highlight.ctaText}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
