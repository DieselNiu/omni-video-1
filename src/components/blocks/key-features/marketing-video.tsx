'use client';

import { cn } from '@/lib/utils';
import { Volume2, VolumeX } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [isVideoReady, setIsVideoReady] = useState(!poster);

  useEffect(() => {
    setIsVideoReady(!poster);
  }, [poster, src]);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const hasPoster = !!poster;

  const handleVideoReady = useCallback(() => {
    setIsVideoReady(true);
  }, []);

  const handleCanPlay = useCallback(() => {
    if (hasPoster && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [hasPoster]);

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload={hasPoster ? 'metadata' : undefined}
        autoPlay={!hasPoster}
        onLoadedData={handleVideoReady}
        onPlaying={handleVideoReady}
        onCanPlay={handleCanPlay}
        loop
        muted
        playsInline
        className={cn(
          className || 'h-full w-full object-cover',
          !isVideoReady && 'opacity-0'
        )}
      />
      {poster && (
        <Image
          src={poster}
          alt=""
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className={cn(
            'object-cover transition-opacity duration-300',
            isVideoReady
              ? 'pointer-events-none opacity-0'
              : 'pointer-events-none opacity-100'
          )}
          aria-hidden="true"
        />
      )}
      <button
        type="button"
        onClick={toggleMute}
        className="absolute right-3 bottom-3 z-10 rounded-full bg-black/60 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
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
