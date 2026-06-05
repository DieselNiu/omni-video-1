'use client';

import { useIntersectionObserver } from '@/hooks/use-intersection-observer';
import Image from 'next/image';
import type { GalleryItemProps } from './types';

export function GalleryItem({
  item,
  activeVideoId,
  onVideoHover,
  onItemClick,
}: GalleryItemProps) {
  const { src, type, prompt, thumbnail } = item;
  const { ref, isVisible } = useIntersectionObserver();

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

  const shouldPlay = type === 'video' && item.id === activeVideoId;

  const handleMouseEnter = () => {
    if (type === 'video' && isVisible) {
      onVideoHover(item.id);
    }
  };

  const handleMouseLeave = () => {
    if (shouldPlay) {
      onVideoHover(null);
    }
  };

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
      {/* Base poster/image */}
      <Image
        src={thumbnail || src}
        alt={prompt}
        fill
        className="object-cover z-10"
        loading="lazy"
      />

      {/* Video Element - Only rendered when active */}
      {type === 'video' && shouldPlay && (
        <video
          src={src}
          poster={thumbnail}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          controlsList="nodownload"
          className="absolute inset-0 w-full h-full object-cover z-20"
        />
      )}

      {/* Image hover effect */}
      {type === 'image' && (
        <Image
          src={thumbnail || src}
          alt={prompt}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      )}
    </div>
  );
}
