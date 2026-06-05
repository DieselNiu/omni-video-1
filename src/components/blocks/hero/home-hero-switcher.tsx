'use client';

import { cn } from '@/lib/utils';
import { ImageIcon, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import ImageHeroSection from './image-hero';
import VideoHeroSection from './video-hero';

type HeroMode = 'image' | 'video';

const modes = [
  { id: 'video', icon: Video },
  { id: 'image', icon: ImageIcon },
] as const;

interface HomeHeroSwitcherProps {
  defaultMode: HeroMode;
}

export default function HomeHeroSwitcher({
  defaultMode,
}: HomeHeroSwitcherProps) {
  const t = useTranslations('HomePage.heroSwitcher');
  const [mode, setMode] = useState<HeroMode>(defaultMode);

  return (
    <div className="flex flex-col">
      <div className="mx-auto w-full max-w-screen-2xl px-3 pt-3 sm:px-6 sm:pt-6 lg:px-8">
        <div className="flex justify-center">
          <div className="inline-flex w-full items-center gap-1 rounded-full bg-muted/60 p-1 sm:w-auto">
            {modes.map((item) => {
              const Icon = item.icon;
              const isActive = mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id)}
                  className={cn(
                    'inline-flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition-all sm:flex-none sm:px-5',
                    isActive
                      ? 'bg-[#6359a6] text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="size-4" />
                  <span className="text-nowrap">{t(item.id)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {mode === 'video' ? <VideoHeroSection /> : <ImageHeroSection />}
    </div>
  );
}
