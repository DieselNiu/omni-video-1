'use client';

import { WatermarkOverlay } from '@/components/watermark-overlay';
import { useIntersectionObserver } from '@/hooks/use-intersection-observer';
import { Download, Heart, Play } from 'lucide-react';
import Image from 'next/image';
import type { GalleryItemProps } from './types';

export function GalleryItem({
  item,
  activeVideoId,
  onVideoHover,
  onItemClick,
}: GalleryItemProps) {
  const { src, type, prompt, thumbnail, resolution } = item;
  const { ref, isVisible } = useIntersectionObserver();

  // Calculate aspect ratio class
  const aspectRatioClass =
    {
      '1:1': 'aspect-square',
      '16:9': 'aspect-[16/9]',
      '9:16': 'aspect-[9/16]',
      '4:3': 'aspect-[4/3]',
      '3:2': 'aspect-[3/2]',
      '3:4': 'aspect-[3/4]',
      '2:3': 'aspect-[2/3]',
      '4:5': 'aspect-[4/5]',
    }[item.aspectRatio] || 'aspect-square';

  // Check if this video should be playing
  const shouldPlay = type === 'video' && item.id === activeVideoId;

  // Handle hover for video playback
  const handleMouseEnter = () => {
    if (type === 'video' && isVisible) {
      onVideoHover(item.id); // Set this video as active
    }
  };

  const handleMouseLeave = () => {
    if (shouldPlay) {
      onVideoHover(null); // Clear active video
    }
  };

  // Handle click to open modal
  const handleClick = () => {
    onItemClick(item);
  };

  return (
    <div
      ref={ref}
      className={`group relative ${aspectRatioClass} overflow-hidden rounded-lg mb-4 cursor-pointer`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {/* Base Content - Always render base poster/image */}
      <Image
        src={thumbnail || src}
        alt={prompt}
        fill
        className="object-cover z-10"
        loading="lazy"
      />

      {/* Video Element - Only rendered when active */}
      {type === 'video' && shouldPlay && (
        <>
          <video
            src={src}
            poster={thumbnail}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            controlsList="nodownload"
            className="absolute inset-0 w-full h-full object-cover z-20"
          />
          <WatermarkOverlay />
        </>
      )}

      {/* Image with Hover Effect - Only for non-video items */}
      {type === 'image' && (
        <Image
          src={thumbnail || src}
          alt={prompt}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      )}

      {/* Video Badge */}
      {type === 'video' && (
        <div
          className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs text-white after:content-[attr(data-label)]"
          data-label="Video"
          role="img"
          aria-label="Video"
        >
          <Play className="size-3 fill-current" aria-hidden="true" />
        </div>
      )}

      {/* Resolution Badge */}
      {resolution && (
        <div
          className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white after:content-[attr(data-label)]"
          data-label={resolution}
          role="img"
          aria-label={`Resolution ${resolution}`}
        />
      )}

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        {/* Action Buttons */}
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          <button
            type="button"
            className="rounded-full bg-white/20 p-2 backdrop-blur-sm transition-colors hover:bg-white/30"
            aria-label="Add to favorites"
          >
            <Heart className="size-4 text-white" />
          </button>
          <button
            type="button"
            className="rounded-full bg-white/20 p-2 backdrop-blur-sm transition-colors hover:bg-white/30"
            aria-label="Download"
          >
            <Download className="size-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
