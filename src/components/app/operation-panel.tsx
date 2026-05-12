'use client';

import { cn } from '@/lib/utils';
import type { PanelMode } from '@/stores/app-page-store';
import { useAppPageStore } from '@/stores/app-page-store';
import { PanelFormEffect } from './panel-form-effect';
import { PanelFormImage } from './panel-form-image';
import { PanelFormVideo } from './panel-form-video';

interface OperationPanelProps {
  target: 'image' | 'video';
  /**
   * 'standard' (default): normal /app behavior with mode tabs.
   * 'effect': zero-config effect landing page — renders the stripped-down
   * PanelFormEffect and hides mode tabs entirely.
   */
  mode?: 'standard' | 'effect';
  /** Required when `mode === 'effect'` — the effect slug to render. */
  effectId?: string;
}

const IMAGE_MODES: { value: PanelMode; label: string }[] = [
  { value: 'txt2img', label: 'Text to Image' },
  { value: 'img2img', label: 'Image to Image' },
];

const VIDEO_MODES: { value: PanelMode; label: string }[] = [
  { value: 'txt2vid', label: 'Text to Video' },
  { value: 'img2vid', label: 'Image to Video' },
];

export function OperationPanel({
  target,
  mode = 'standard',
  effectId,
}: OperationPanelProps) {
  const { panelMode, setPanelMode } = useAppPageStore();

  // Effect mode: no tabs, single stripped-down form.
  if (mode === 'effect' && effectId) {
    return (
      <div className="flex flex-col h-full">
        <PanelFormEffect effectId={effectId} />
      </div>
    );
  }

  const modes = target === 'image' ? IMAGE_MODES : VIDEO_MODES;

  return (
    <div className="flex flex-col h-full">
      {/* Mode tabs */}
      <div className="flex border-b">
        {modes.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setPanelMode(m.value)}
            className={cn(
              'relative flex-1 whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors',
              panelMode === m.value
                ? 'text-foreground after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-20 after:h-0.5 after:bg-foreground after:rounded-full'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Form content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {(panelMode === 'txt2img' || panelMode === 'img2img') && (
          <PanelFormImage isImg2Img={panelMode === 'img2img'} />
        )}
        {(panelMode === 'txt2vid' || panelMode === 'img2vid') && (
          <PanelFormVideo isImg2Vid={panelMode === 'img2vid'} />
        )}
      </div>
    </div>
  );
}
