'use client';

import { PromptOptimizer } from '@/components/dashboard/prompt-optimizer';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useGenerateForm } from '@/hooks/use-generate-form';
import {
  DEFAULT_IMAGE_MODEL,
  getImageModel,
  getResolutionOptions,
} from '@/image/config/image-models';
import { cn } from '@/lib/utils';
import { useAppPageStore } from '@/stores/app-page-store';
import { CoinsIcon, RefreshCw, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';

const PROMPT_IDEAS = [
  'Rainy Day Dreamer',
  'Fluttering Wings',
  'Park Life',
  'Rush Hour Runner',
  'Neon City Lights',
  'Ocean Sunset Glow',
  'Mountain Peak Mist',
  'Vintage Café Scene',
  'Cosmic Nebula Burst',
  'Cherry Blossom Path',
  'Underwater Kingdom',
  'Steampunk Airship',
];
import { PanelImageUpload } from './panel-image-upload';

const ASPECT_RATIOS = [
  { value: '1:1', iconClass: 'flex size-4 border border-current' },
  { value: '16:9', iconClass: 'flex h-2.5 w-4 border border-current' },
  { value: '9:16', iconClass: 'flex h-4 w-2.5 border border-current' },
  { value: '4:3', iconClass: 'flex h-3 w-4 border border-current' },
  { value: '3:4', iconClass: 'flex h-4 w-3 border border-current' },
];

interface PanelFormImageProps {
  isImg2Img: boolean;
}

export function PanelFormImage({ isImg2Img }: PanelFormImageProps) {
  const setMobileTab = useAppPageStore((s) => s.setMobileTab);
  const setPanelMode = useAppPageStore((s) => s.setPanelMode);

  // ─── Shared form state via the centralized hook ──────────────────────
  // Switching between this panel and the floating bar (or even opening
  // this panel after the user typed in the bar) preserves prompt and
  // model selection because both surfaces read from the same store.
  const {
    prompt,
    setPrompt,
    image,
    setImageModel,
    setImageAspectRatio,
    setImageResolution,
    img2imgInputs,
    setImg2imgInputs,
    getImageModelOptions,
    imageShowResolution,
    getImageRequiredCredits,
    submitImage,
  } = useGenerateForm();

  const selectedModel = image.selectedModel;
  const aspectRatio = image.aspectRatio;
  const resolution = image.resolution;

  const mode = isImg2Img ? 'image-to-image' : 'text-to-image';
  const modelOptions = useMemo(
    () => getImageModelOptions(mode),
    [getImageModelOptions, mode]
  );

  // Each mode has its own valid-model set. Snap to a valid model
  // whenever the current selection isn't in the active mode's option list
  // (e.g. user uploads an image to enter img2img while a t2i-only model
  // was selected). Without this snap the Select would render blank.
  // Intentionally only depends on isImg2Img — re-snapping on every model
  // change would prevent the user from picking a different model.
  useEffect(() => {
    const validIds = modelOptions.map((m) => m.value);
    if (validIds.includes(selectedModel)) return;
    setImageModel(DEFAULT_IMAGE_MODEL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isImg2Img]);

  // Mode-local UI state — just the idea shuffling now.
  // Uploaded source images live in the shared store so the floating bar
  // can see them too (and gate its img2img Generate button on them).
  const uploadedImages = img2imgInputs;
  const setUploadedImages = setImg2imgInputs;
  const [ideasSeed, setIdeasSeed] = useState(0);

  // Pick 4 random ideas based on seed
  const visibleIdeas = useMemo(() => {
    const shuffled = [...PROMPT_IDEAS].sort(
      () => Math.sin(ideasSeed * 9301 + 49297) - 0.5
    );
    return shuffled.slice(0, 4);
  }, [ideasSeed]);

  // Filtered aspect ratios based on model
  const filteredAspectRatios = useMemo(() => {
    const modelConfig = getImageModel(selectedModel);
    if (!modelConfig?.supportedAspectRatios) return ASPECT_RATIOS;
    return ASPECT_RATIOS.filter((r) =>
      modelConfig.supportedAspectRatios.includes(r.value)
    );
  }, [selectedModel]);

  const requiredCredits = getImageRequiredCredits();
  const showResolution = imageShowResolution;

  // In img2img mode we need at least one fully-uploaded source image
  // (r2Url present, not still uploading) before we can generate.
  const hasReadyImage = uploadedImages.some(
    (img) => img.r2Url && !img.uploading
  );
  const canGenerate = !!prompt.trim() && (!isImg2Img || hasReadyImage);

  const handleGenerate = useCallback(async () => {
    const readyImageUrls = isImg2Img
      ? uploadedImages
          .filter((img) => img.r2Url && !img.uploading)
          .map((img) => img.r2Url as string)
      : undefined;

    await submitImage({
      isImageInput: isImg2Img,
      imageUrls: readyImageUrls,
      // Gallery optimistic card is the source of truth for in-progress
      // state — the form button itself stays ready for the next prompt.
      // Clear the prompt so the button flips back to its idle color
      // immediately (otherwise the user can't tell their click landed).
      // Matches the floating bar pattern.
      onSubmittedToGallery: () => {
        setPrompt('');
        setMobileTab('history');
      },
    });
  }, [isImg2Img, uploadedImages, submitImage, setPrompt, setMobileTab]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-6 p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full">
        {/* Model selector */}
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground/70">Model</span>
          <div className="flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 text-sm">
            <span className="flex items-center gap-2">
              {modelOptions[0]?.logo ? (
                <Image
                  src={modelOptions[0].logo}
                  alt="OpenAI"
                  width={16}
                  height={16}
                  className="size-4"
                />
              ) : (
                <span>{modelOptions[0]?.icon || '◌'}</span>
              )}
              <span>{modelOptions[0]?.label || 'GPT Image 2'}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {modelOptions[0]?.credits || 14} credits
            </span>
          </div>
        </div>

        {/* Image upload for img2img */}
        {isImg2Img && (
          <PanelImageUpload
            images={uploadedImages}
            onImagesChange={setUploadedImages}
            maxImages={3}
            intent="image-input"
            onGenerateFirst={() => setPanelMode('txt2img')}
          />
        )}

        {/* Prompt */}
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground/70">
            {isImg2Img ? 'Describe changes' : 'Prompt'}
          </span>
          <div className="rounded-lg border border-input dark:bg-[#333] bg-gray-200 overflow-hidden">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                isImg2Img
                  ? 'Describe what changes to make...'
                  : 'What do you want to create?'
              }
              maxLength={4000}
              rows={5}
              className="border-0 resize-y bg-transparent shadow-none focus-visible:ring-0 text-sm min-h-[180px] max-h-[320px]"
            />
            {/* Bottom bar inside textarea card */}
            <div className="flex items-center justify-between px-3 pb-2.5">
              <PromptOptimizer
                mediaType="image"
                prompt={prompt}
                onPromptChange={setPrompt}
                imageUrl={isImg2Img ? uploadedImages[0]?.r2Url : undefined}
              />
              <span className="text-[11px] text-muted-foreground/60">
                {prompt.length} / 4000
              </span>
            </div>
          </div>
          {/* Prompt ideas */}
          <div className="flex items-start gap-1.5 flex-wrap text-xs">
            <span className="text-muted-foreground/60 py-0.5">Ideas:</span>
            {visibleIdeas.map((idea) => (
              <button
                key={idea}
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors py-0.5 cursor-pointer"
                onClick={() => setPrompt(idea)}
              >
                {idea}
              </button>
            ))}
            <button
              type="button"
              className="text-muted-foreground/60 hover:text-foreground transition-colors p-0.5 cursor-pointer ml-auto"
              onClick={() => setIdeasSeed((s) => s + 1)}
            >
              <RefreshCw className="size-3" />
            </button>
          </div>
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground/70">
            Aspect Ratio
          </span>
          <div className="flex flex-wrap gap-2">
            {filteredAspectRatios.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setImageAspectRatio(r.value)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                  aspectRatio === r.value
                    ? 'border-foreground/30 bg-foreground/10 text-foreground'
                    : 'border-border hover:border-muted-foreground/50'
                )}
              >
                <div className={r.iconClass} />
                <span>{r.value}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Resolution (Pro model only) */}
        {showResolution && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground/70">
              Resolution
            </span>
            <Select value={resolution} onValueChange={setImageResolution}>
              <SelectTrigger className="w-full h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getResolutionOptions().map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {/* Credits + Generate - fixed bottom */}
      <div className="shrink-0 space-y-3 pt-3 pb-3 px-4 bg-sidebar border-t border-border/50">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <CoinsIcon className="size-3.5" />
            Required Credits
          </span>
          <span className="font-medium">{requiredCredits}</span>
        </div>
        <Button
          variant="generate"
          data-active={canGenerate}
          className="w-full h-11 text-sm"
          onClick={handleGenerate}
          disabled={!canGenerate}
        >
          <Sparkles className="size-4 mr-2" />
          Generate Image
        </Button>
      </div>
    </div>
  );
}
