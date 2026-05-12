'use client';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { WatermarkOverlay } from '@/components/watermark-overlay';
import { Check, Copy, X } from 'lucide-react';
import { useState } from 'react';
import type { VideoModalProps } from './types';

export function VideoModal({ item, open, onOpenChange }: VideoModalProps) {
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!item) return null;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(item.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Truncate prompt for display
  const PROMPT_MAX_LENGTH = 200;
  const shouldTruncatePrompt = item.prompt.length > PROMPT_MAX_LENGTH;
  const displayPrompt = showFullPrompt
    ? item.prompt
    : item.prompt.slice(0, PROMPT_MAX_LENGTH) +
      (shouldTruncatePrompt ? '...' : '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[1280px] w-[84vw] h-[76vh] p-0 gap-0"
        style={{ marginLeft: '-150px' }}
      >
        <DialogTitle className="sr-only">
          {item.type === 'video' ? 'Video Details' : 'Image Details'}
        </DialogTitle>
        <div className="flex h-full flex-col lg:flex-row">
          {/* Video/Image Section */}
          <div className="relative w-full bg-black lg:w-[58%] lg:min-w-[540px]">
            <div className="flex h-full w-full items-center justify-center px-3.5 py-5">
              <div className="relative h-[68vh] w-full max-w-[880px] flex-shrink-0 overflow-hidden rounded-xl bg-black shadow-lg">
                {item.type === 'video' ? (
                  <>
                    <video
                      src={item.src}
                      poster={item.thumbnail}
                      controls
                      controlsList="nodownload"
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                    <WatermarkOverlay />
                  </>
                ) : (
                  <img
                    src={item.src}
                    alt={item.prompt}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Details Section */}
          <div className="relative flex w-full flex-col gap-5 bg-card p-6 lg:w-[42%] lg:min-w-[380px] lg:border-l lg:border-border/60 lg:overflow-y-auto lg:max-h-[76vh]">
            {/* Close Button */}
            <DialogClose className="absolute -right-1 -top-1 z-10 p-1 text-muted-foreground transition hover:text-foreground focus:outline-none">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DialogClose>
            {/* Prompt Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Prompt</h2>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className={`p-1.5 rounded transition-colors flex items-center gap-2 text-sm ${
                    copied
                      ? 'text-primary'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                  title="Copy prompt"
                >
                  {copied ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="rounded-lg bg-muted/30 p-4">
                <div className="max-h-56 overflow-y-auto pr-2">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                    {displayPrompt}
                  </p>
                </div>
                {shouldTruncatePrompt && (
                  <button
                    type="button"
                    onClick={() => setShowFullPrompt(!showFullPrompt)}
                    className="mt-3 text-sm text-primary hover:underline"
                  >
                    {showFullPrompt ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            </div>

            {/* Settings Section */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="text-sm font-semibold">Settings</div>
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">
                    Model
                  </div>
                  <div className="text-sm font-medium">{item.model}</div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">
                    Aspect Ratio
                  </div>
                  <div className="text-sm font-medium">{item.aspectRatio}</div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">
                    Resolution
                  </div>
                  <div className="text-sm font-medium">
                    {item.resolution || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">
                    File Type
                  </div>
                  <div className="text-sm font-medium uppercase">
                    {item.type === 'video' ? 'MP4' : 'JPG'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
