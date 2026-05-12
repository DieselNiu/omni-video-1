'use client';

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

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const hasPoster = !!poster;

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
        onCanPlay={handleCanPlay}
        loop
        muted
        playsInline
        className={className || 'h-full w-full object-cover'}
      />
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
