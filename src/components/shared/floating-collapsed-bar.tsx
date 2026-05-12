'use client';

import { Button } from '@/components/ui/button';
import { CoinsIcon, Loader2, Plus, Sparkles } from 'lucide-react';
import { BorderGlow } from './border-glow';

interface FloatingCollapsedBarProps {
  prompt: string;
  placeholder?: string;
  credits: number;
  isGenerating: boolean;
  generateLabel?: string;
  onBarClick: () => void;
  onGenerate: () => void;
  disabled?: boolean;
  /**
   * Overrides the default "has text" check that decides whether the
   * Generate button is active. Pass this when the surface has extra
   * requirements beyond prompt text — e.g. img2X modes that also need
   * a ready uploaded source image. If omitted, falls back to
   * `prompt.trim().length > 0` so existing call sites keep working.
   */
  canGenerate?: boolean;
}

/**
 * Collapsed floating bar – identical to the homepage floating bar.
 * Shows prompt preview, + icon, and generate button.
 * Click the bar to expand; click generate to submit.
 */
export function FloatingCollapsedBar({
  prompt,
  placeholder = 'What do you want to create today',
  credits,
  isGenerating,
  generateLabel = 'Generate',
  onBarClick,
  onGenerate,
  disabled,
  canGenerate,
}: FloatingCollapsedBarProps) {
  const hasText = prompt.trim().length > 0;
  // Prefer the parent's explicit signal when given, otherwise fall back
  // to the legacy "any prompt text" check.
  const ready = canGenerate ?? hasText;
  return (
    <div
      className="relative mx-auto w-full max-w-[700px] rounded-2xl shadow-2xl cursor-pointer"
      onClick={onBarClick}
    >
      <BorderGlow radius="rounded-2xl" />
      <div className="flex h-14 items-center gap-3 rounded-2xl bg-sidebar/40 px-4 backdrop-blur-2xl transition-all">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-border">
          <Plus className="size-5 text-muted-foreground" />
        </div>
        <span className="flex-1 truncate text-sm text-muted-foreground">
          {prompt || placeholder}
        </span>
        <Button
          variant="generate"
          data-active={ready}
          className="h-9 shrink-0 gap-2 rounded-full px-4 text-sm"
          onClick={(e) => {
            e.stopPropagation();
            onGenerate();
          }}
          disabled={disabled || isGenerating || !ready}
        >
          {isGenerating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {generateLabel}
          <span className="flex items-center gap-0.5 text-xs">
            <CoinsIcon className="size-3" />
            {credits}
          </span>
        </Button>
      </div>
    </div>
  );
}
