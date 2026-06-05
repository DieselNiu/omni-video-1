'use client';

import { EffectsGrid } from '@/components/effects/effects-grid';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { type EffectConfig, getEffect } from '@/effect/config/effects';
import { useGenerateForm } from '@/hooks/use-generate-form';
import { cn } from '@/lib/utils';
import { resolveUploadedUrls } from '@/storage/pending-uploads';
import { useAppPageStore } from '@/stores/app-page-store';
import {
  CheckCircle2,
  ChevronRight,
  CoinsIcon,
  Loader2,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { UploadedImage } from './image-upload-area';
import { PanelImageUpload } from './panel-image-upload';

interface PanelFormEffectProps {
  effectId: string;
}

/**
 * Extremely stripped-down panel form used by /effect/[slug] pages.
 *
 * Everything except the image upload is fixed by the EffectConfig and
 * hidden from the UI: prompt, model, aspect ratio, duration, resolution,
 * audio, visibility. The user sees upload → credits → Generate.
 *
 * On mount (and whenever the effect changes) we push the fixed params
 * into the shared generate-form store so submitVideo picks them up.
 * Unlike panel-form-video we do NOT clear the prompt on submit, because
 * the prompt IS the effect — users would lose the fixed string and the
 * next click would become a text-to-video request with empty prompt.
 */
export function PanelFormEffect({ effectId }: PanelFormEffectProps) {
  const effect = getEffect(effectId);
  const setMobileTab = useAppPageStore((s) => s.setMobileTab);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const {
    setPrompt,
    setVideoModel,
    setVideoAspectRatio,
    setVideoDuration,
    setVideoResolution,
    setVideoGenerateAudio,
    submitVideo,
  } = useGenerateForm();

  const numSlots = effect?.requiredImages ?? 1;
  // For multi-image effects, each slot gets its own state array.
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploadedImages2, setUploadedImages2] = useState<UploadedImage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inject fixed effect params into the shared form store. Runs on mount
  // and whenever the effect slug changes (e.g. client-side nav between
  // two effect pages without a hard reload).
  useEffect(() => {
    if (!effect) return;
    setPrompt(effect.fixedPrompt);
    // isImg2Vid = true — all v1 effects are image-to-video
    setVideoModel(effect.baseModel, true);
    setVideoAspectRatio(effect.aspectRatio);
    if (effect.videoDuration !== undefined) {
      setVideoDuration(String(effect.videoDuration));
    }
    if (effect.videoResolution) {
      setVideoResolution(effect.videoResolution);
    }
    if (effect.generateAudio !== undefined) {
      setVideoGenerateAudio(effect.generateAudio);
    }
  }, [
    effect,
    setPrompt,
    setVideoModel,
    setVideoAspectRatio,
    setVideoDuration,
    setVideoResolution,
    setVideoGenerateAudio,
  ]);

  // Optimistic upload: a slot counts the moment a photo is picked (still
  // uploading) — uploads are awaited at submit time, not blocked up front.
  const hasUsableImage = uploadedImages.some(
    (img) => !img.error && (img.r2Url || img.uploading)
  );
  const hasUsableImage2 =
    numSlots < 2 ||
    uploadedImages2.some((img) => !img.error && (img.r2Url || img.uploading));
  const canGenerate = hasUsableImage && hasUsableImage2 && !isSubmitting;

  const handleGenerate = useCallback(async () => {
    if (!effect) return;
    setIsSubmitting(true);
    try {
      // Await any in-flight uploads, then read final R2 URLs.
      const [url1] = await resolveUploadedUrls(uploadedImages);
      if (!url1) return;

      const imageUrls: string[] = [url1];
      const isReference = numSlots >= 2;
      const imageRoles: ('first_frame' | 'last_frame' | 'reference_image')[] = [
        isReference ? 'reference_image' : 'first_frame',
      ];

      if (numSlots >= 2) {
        const [url2] = await resolveUploadedUrls(uploadedImages2);
        if (!url2) return;
        imageUrls.push(url2);
        imageRoles.push('reference_image');
      }

      await submitVideo({
        isImageInput: true,
        imageUrls,
        imageRoles,
        generationType: isReference ? 'REFERENCE_2_VIDEO' : 'IMAGE_2_VIDEO',
        onSubmittedToGallery: () => {
          setMobileTab('history');
        },
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    effect,
    numSlots,
    uploadedImages,
    uploadedImages2,
    submitVideo,
    setMobileTab,
  ]);

  if (!effect) return null;

  // Human-friendly title for the header. We don't pull from next-intl
  // here because the Effect translations namespace may not exist yet for
  // every effect; the marketing page owns the localized copy and the
  // panel just shows a short plain-text label.
  const title = effect.id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-5 p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full">
        {/* Effect selector card — click to open modal listing all effects */}
        <button
          type="button"
          onClick={() => setSelectorOpen(true)}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl border bg-background/60 p-2.5 text-left',
            'transition-colors hover:bg-background hover:border-foreground/20'
          )}
        >
          <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src={effect.previewVideoUrl}
              poster={effect.previewPoster}
              muted
              playsInline
              preload="metadata"
            >
              <track kind="captions" />
            </video>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {title}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              Tap to browse all effects
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>

        {/* Step 1: Upload image(s) */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
              1
            </span>
            <span className="text-sm font-medium text-foreground">
              {effect.uploadLabels?.[0] ?? 'Upload a full-body photo'}
            </span>
          </div>
          <HoverCard openDelay={150} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div>
                <PanelImageUpload
                  images={uploadedImages}
                  onImagesChange={setUploadedImages}
                  maxImages={1}
                  intent="effect-input"
                  title=""
                  compact
                />
              </div>
            </HoverCardTrigger>
            <HoverCardContent
              side="right"
              align="start"
              sideOffset={12}
              className="w-72 p-4"
            >
              <PhotoRequirements requirements={effect.photoRequirements} />
            </HoverCardContent>
          </HoverCard>
        </div>

        {numSlots >= 2 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                2
              </span>
              <span className="text-sm font-medium text-foreground">
                {effect.uploadLabels?.[1] ?? 'Upload a second photo'}
              </span>
            </div>
            <HoverCard openDelay={150} closeDelay={100}>
              <HoverCardTrigger asChild>
                <div>
                  <PanelImageUpload
                    images={uploadedImages2}
                    onImagesChange={setUploadedImages2}
                    maxImages={1}
                    intent="effect-input"
                    title=""
                    compact
                  />
                </div>
              </HoverCardTrigger>
              <HoverCardContent
                side="right"
                align="start"
                sideOffset={12}
                className="w-72 p-4"
              >
                <PhotoRequirements requirements={effect.photoRequirements} />
              </HoverCardContent>
            </HoverCard>
          </div>
        )}
      </div>

      {/* Credits + Generate — fixed bottom */}
      <div className="shrink-0 space-y-3 pt-3 pb-3 px-4 bg-sidebar border-t border-border/50">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <CoinsIcon className="size-3.5" />
            Required Credits
          </span>
          <span className="font-medium">{effect.credits}</span>
        </div>
        <Button
          variant="generate"
          data-active={canGenerate}
          className="w-full h-11 text-sm"
          onClick={handleGenerate}
          disabled={!canGenerate}
        >
          {isSubmitting ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="size-4 mr-2" />
          )}
          Generate
        </Button>
      </div>

      <EffectSelectorDialog
        open={selectorOpen}
        onOpenChange={setSelectorOpen}
      />
    </div>
  );
}

/**
 * Modal that lists all available effects. Reuses `EffectsGrid` directly
 * so this picker always matches `/effects` — real effects from the
 * registry first, then the coming-soon placeholders. Clicking a real
 * effect card triggers a `LocaleLink` navigation, and the route change
 * unmounts the dialog automatically.
 */
function EffectSelectorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose an effect</DialogTitle>
        </DialogHeader>
        <div className="pt-2">
          <EffectsGrid />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Photo requirements hover card body. Rendered next to the upload
 * dropzone when the user hovers over it — mirrors the Mango AI
 * reference layout: one positive rule, one negative rule.
 */
function PhotoRequirements({
  requirements,
}: {
  requirements?: EffectConfig['photoRequirements'];
}) {
  const positive =
    requirements?.positive ??
    'A single person, full-body photo, clearly visible pose';
  const negative =
    requirements?.negative ??
    'No children, no multiple people, no heavily obstructed bodies';
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">
        Photo requirements
      </p>
      <ul className="space-y-2 text-xs">
        <li className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          <span className="text-foreground/80">{positive}</span>
        </li>
        <li className="flex items-start gap-2">
          <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
          <span className="text-foreground/80">{negative}</span>
        </li>
      </ul>
    </div>
  );
}
