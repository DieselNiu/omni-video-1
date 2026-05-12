'use client';

import { cn } from '@/lib/utils';
import { Slider as SliderPrimitive } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';

export interface CreditStep {
  credits: number;
  label: string;
  /** Optional override for the floating badge text (e.g. "$0.029 per credit") */
  badgeText?: string;
}

interface CreditSliderProps {
  steps: CreditStep[];
  currentStep: number;
  onStepChange: (index: number) => void;
  className?: string;
  showHint?: boolean;
}

function HandFingerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
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

/**
 * Credit Slider Component
 *
 * A discrete slider with labeled stops showing credit amounts.
 * Features a floating badge above the thumb and a gradient track.
 */
export function CreditSlider({
  steps,
  currentStep,
  onStepChange,
  className,
  showHint = false,
}: CreditSliderProps) {
  const max = steps.length - 1;
  const sliderRef = useRef<HTMLDivElement>(null);
  const [hintVisible, setHintVisible] = useState(false);

  useEffect(() => {
    if (showHint) {
      setHintVisible(true);
      const timer = setTimeout(() => setHintVisible(false), 7800);
      return () => clearTimeout(timer);
    }
    setHintVisible(false);
  }, [showHint]);

  const handleValueChange = (values: number[]) => {
    const newStep = values[0];
    if (newStep !== undefined && newStep !== currentStep) {
      onStepChange(newStep);
    }
  };

  return (
    <div className={cn('relative w-full', className)}>
      {/* Floating credit badge above thumb */}
      <div className="relative h-8 mb-1 z-30">
        <div
          className="absolute -translate-x-1/2 transition-all duration-200 z-30"
          style={{
            left: `${max === 0 ? 0 : (currentStep / max) * 100}%`,
          }}
        >
          <div className="bg-[#7c3aed] text-white text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap shadow-lg">
            {steps[currentStep].badgeText ??
              `${steps[currentStep].credits.toLocaleString()} credits`}
          </div>
        </div>
      </div>

      {/* Slider */}
      <div className="relative" ref={sliderRef}>
        <SliderPrimitive.Root
          value={[currentStep]}
          onValueChange={handleValueChange}
          min={0}
          max={max}
          step={1}
          className="relative flex w-full touch-none items-center select-none h-5"
        >
          <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted">
            <SliderPrimitive.Range className="absolute h-full bg-gradient-to-r from-[#5b21b6] to-[#7c3aed]" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="block size-5 shrink-0 rounded-full border-2 border-[#7c3aed] bg-white shadow-md ring-[#7c3aed]/30 transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden cursor-grab active:cursor-grabbing" />
        </SliderPrimitive.Root>

        {/* Drag hint: finger slides left→right 3 times */}
        {hintVisible && (
          <div
            className="absolute pointer-events-none"
            style={{ top: '6px', left: '6px' }}
          >
            <div
              style={{
                animation: 'sliderHintSlide 2.6s ease-in-out 3',
                ['--slider-width' as string]: sliderRef.current
                  ? `${sliderRef.current.offsetWidth}px`
                  : '300px',
              }}
            >
              <HandFingerIcon className="size-9 text-[#7c3aed] drop-shadow-lg" />
            </div>
          </div>
        )}
      </div>

      {/* Step labels — only show first and last */}
      <div className="relative mt-2 flex justify-between text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => onStepChange(0)}
          className={cn(
            'cursor-pointer transition-colors hover:text-foreground',
            currentStep === 0 && 'text-foreground font-medium'
          )}
        >
          {steps[0].label}
        </button>
        <button
          type="button"
          onClick={() => onStepChange(max)}
          className={cn(
            'cursor-pointer transition-colors hover:text-foreground',
            currentStep === max && 'text-foreground font-medium'
          )}
        >
          {steps[max].label}
        </button>
      </div>
    </div>
  );
}
