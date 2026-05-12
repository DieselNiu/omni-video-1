'use client';

import { websiteConfig } from '@/config/website';
import { useTranslations } from 'next-intl';
import { getDemoMedia } from './demo-media';
import { MasonryGallery } from './masonry-gallery';

export default function UseCasesSection() {
  const t = useTranslations('UseCases');
  const isVideoSite = websiteConfig.siteType === 'video';
  const mediaItems = getDemoMedia(websiteConfig.siteType);

  return (
    <section id="use-cases" className="py-20 lg:py-32 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            {isVideoSite ? t('videoTitle') : t('imageTitle')}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {isVideoSite ? t('videoSubtitle') : t('imageSubtitle')}
          </p>
        </div>

        <div className="max-w-7xl mx-auto">
          <MasonryGallery items={mediaItems} />
        </div>
      </div>
    </section>
  );
}
