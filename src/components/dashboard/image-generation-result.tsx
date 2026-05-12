'use client';

import { Button } from '@/components/ui/button';
import { useElapsedTime } from '@/hooks/use-elapsed-time';
import { cn, downloadImage } from '@/lib/utils';
import { useImageGenerationStore } from '@/stores/image-generation-store';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  ImageIcon,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import Image from 'next/image';

interface ImageGenerationResultProps {
  onRegenerate?: () => void;
  onClose?: () => void;
}

export function ImageGenerationResult({
  onRegenerate,
  onClose,
}: ImageGenerationResultProps) {
  const { status, activeGeneration, error, reset } = useImageGenerationStore();
  const elapsedTime = useElapsedTime(
    activeGeneration?.startTime,
    status === 'polling'
  );

  // Don't render if idle
  if (status === 'idle') {
    return null;
  }

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const handleDownload = (url: string, index: number) => {
    downloadImage(url, `generated-image-${index + 1}.png`);
  };

  return (
    <div className="rounded-xl border bg-card p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {status === 'submitting' && (
            <>
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="font-medium">Submitting...</span>
            </>
          )}
          {status === 'polling' && (
            <>
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="font-medium">Generating...</span>
              <span className="text-sm text-muted-foreground">
                ({elapsedTime}s)
              </span>
            </>
          )}
          {status === 'completed' && (
            <>
              <CheckCircle2 className="size-5 text-green-500" />
              <span className="font-medium text-green-600">Complete!</span>
            </>
          )}
          {status === 'failed' && (
            <>
              <AlertCircle className="size-5 text-destructive" />
              <span className="font-medium text-destructive">Failed</span>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="size-8 min-h-[48px] min-w-[48px]"
          aria-label="Close generation result"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {/* Loading State */}
        {(status === 'submitting' || status === 'polling') && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/nyancat.svg"
              alt="Loading animation"
              width={200}
              height={120}
            />
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                {status === 'submitting'
                  ? 'Preparing your request...'
                  : 'AI is creating your image...'}
              </p>
              {status === 'polling' && (
                <p className="text-xs text-muted-foreground mt-1">
                  This usually takes 30-90 seconds
                </p>
              )}
            </div>
          </div>
        )}

        {/* Success State - Show Images */}
        {status === 'completed' && activeGeneration?.imageUrls && (
          <div className="space-y-4">
            <div
              className={cn(
                'grid gap-4',
                activeGeneration.imageUrls.length === 1
                  ? 'grid-cols-1 max-w-md'
                  : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-w-4xl'
              )}
            >
              {activeGeneration.imageUrls.map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  className="relative group aspect-square rounded-lg overflow-hidden bg-muted max-w-xs"
                >
                  <Image
                    src={url}
                    alt={`Generated image ${index + 1}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  {/* Overlay with actions */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleDownload(url, index)}
                      className="gap-1"
                    >
                      <Download className="size-4" />
                      Download
                    </Button>
                    <Button size="sm" variant="secondary" asChild>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="size-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onRegenerate}
                className="gap-2"
              >
                <RefreshCw className="size-4" />
                Regenerate
              </Button>
            </div>
          </div>
        )}

        {/* Error State */}
        {status === 'failed' && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="size-8 text-destructive" />
            </div>
            <div className="text-center">
              <p className="font-medium text-destructive">Generation Failed</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                {error ||
                  activeGeneration?.errorMessage ||
                  'An unexpected error occurred'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              className="gap-2"
            >
              <RefreshCw className="size-4" />
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact inline status indicator for the generate button
 */
export function GenerationStatusBadge() {
  const { status, activeGeneration } = useImageGenerationStore();
  const elapsedTime = useElapsedTime(
    activeGeneration?.startTime,
    status === 'polling'
  );

  if (status === 'idle' || status === 'completed' || status === 'failed') {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {status === 'submitting' && <span>Submitting...</span>}
      {status === 'polling' && <span>Generating... ({elapsedTime}s)</span>}
    </div>
  );
}

/**
 * Empty state for when no generations exist
 */
export function EmptyGenerationState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
      <div className="size-16 rounded-full bg-muted flex items-center justify-center">
        <ImageIcon className="size-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">No images generated yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Enter a prompt and click Generate to create your first image
        </p>
      </div>
    </div>
  );
}
