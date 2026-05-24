'use client';

import { useIntersectionObserver } from '@/hooks/use-intersection-observer';
import { Volume2, VolumeX } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

interface MarketingVideoProps {
  src: string;
  poster?: string;
  className?: string;
}

export function MarketingVideo({
  src,
  poster,
  className,
}: MarketingVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const { ref: containerRef, isVisible } = useIntersectionObserver('200px');

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const handleCanPlay = useCallback(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {isVisible ? (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          preload="metadata"
          onCanPlay={handleCanPlay}
          loop
          muted
          playsInline
          className={className || 'h-full w-full object-cover'}
        />
      ) : poster ? (
        <img
          src={poster}
          alt=""
          className={className || 'h-full w-full object-cover'}
          loading="lazy"
        />
      ) : null}
      <button
        type="button"
        onClick={toggleMute}
        className="absolute bottom-3 right-3 rounded-full bg-black/60 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? (
          <VolumeX className="h-4 w-4" />
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
