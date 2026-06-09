'use client';

import { useIntersectionObserver } from '@/hooks/use-intersection-observer';
import Image from 'next/image';
import { MarketingVideo } from './marketing-video';

export interface Highlight {
  media: string;
  mediaType: 'image' | 'video';
  poster?: string;
  title: string;
  description: string;
  ctaText: string;
  ctaLink: string;
}

// Client leaf: lazily mounts the video once it scrolls near the viewport.
// Extracted so the parent HighlightsSection can stay a server component.
export function HighlightMedia({ highlight }: { highlight: Highlight }) {
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
