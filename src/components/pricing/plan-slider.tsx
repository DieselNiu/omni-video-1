'use client';

import { cn } from '@/lib/utils';
import { Slider } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';

interface PlanSliderProps {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  showHint?: boolean;
}

function HandFingerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="white"
      stroke="white"
      strokeWidth="0.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 13v-8.5a1.5 1.5 0 0 1 3 0v7.5" />
      <path d="M11 11.5v-2a1.5 1.5 0 1 1 3 0v2.5" />
      <path d="M14 10.5a1.5 1.5 0 0 1 3 0v1.5" />
      <path d="M17 11.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47" />
    </svg>
  );
}

export function PlanSlider({
  value,
  onChange,
  className,
  showHint = false,
}: PlanSliderProps) {
  const [hintVisible, setHintVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showHint) {
      setHintVisible(true);
      const timer = setTimeout(() => setHintVisible(false), 7800);
      return () => clearTimeout(timer);
    }
    setHintVisible(false);
  }, [showHint]);

  return (
    <div className="relative" ref={containerRef}>
      <Slider.Root
        className={cn(
          'relative flex items-center select-none touch-none w-full h-5',
          className
        )}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={0}
        max={3}
        step={1}
      >
        <Slider.Track className="relative grow h-2 rounded-full bg-gray-700">
          <Slider.Range className="absolute h-full rounded-full bg-[#7c3aed]" />
        </Slider.Track>
        <Slider.Thumb className="block size-5 rounded-full bg-[#7c3aed] border-2 border-white shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/50 transition-colors" />
      </Slider.Root>

      {/* Drag hint: finger tip starts at thumb right edge
          Thumb right edge: x=20px, center y=10px in h-5 slider
          SVG finger tip at (14px, 4.5px) in size-9 (36px) icon
          → top = 10 - 4.5 = 6px, left = 20 - 14 = 6px */}
      {hintVisible && (
        <div
          className="absolute pointer-events-none"
          style={{ top: '6px', left: '6px' }}
        >
          <div
            style={{
              animation: 'sliderHintSlide 2.6s ease-in-out 3',
              ['--slider-width' as string]: containerRef.current
                ? `${containerRef.current.offsetWidth}px`
                : '300px',
            }}
          >
            <HandFingerIcon className="size-9 drop-shadow-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
