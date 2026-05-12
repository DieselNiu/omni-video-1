'use client';

interface EffectPreviewVideoProps {
  videoUrl: string;
  poster?: string;
}

export function EffectPreviewVideo({
  videoUrl,
  poster,
}: EffectPreviewVideoProps) {
  return (
    <video
      className="block max-h-full max-w-full rounded-2xl object-contain"
      src={videoUrl}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
    >
      <track kind="captions" />
    </video>
  );
}
