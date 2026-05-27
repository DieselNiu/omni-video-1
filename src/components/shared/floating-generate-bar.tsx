'use client';

import {
  getAssetMediaUrl,
  getAssetThumbnailUrl,
} from '@/assets/business/asset-mapper';
import type { Asset, AssetType } from '@/assets/types';
import { CompactImageInput } from '@/components/app/compact-image-input';
import type { UploadedImage } from '@/components/app/image-upload-area';
import { PromptOptimizer } from '@/components/dashboard/prompt-optimizer';
import { BorderGlow } from '@/components/shared/border-glow';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAssets } from '@/hooks/use-assets';
import { cn } from '@/lib/utils';
import {
  ArrowLeftRight,
  AtSign,
  CoinsIcon,
  Crown,
  ImageIcon,
  Loader2,
  VideoIcon,
} from 'lucide-react';
import {
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useMemo,
  useState,
} from 'react';

/**
 * Pure presentational option used by both image + video model dropdowns.
 * The shared component renders these as `icon + label`. Callers that want a
 * richer dropdown (logos, credits) can pass `renderModelOption` to override.
 */
export interface FloatingBarModelOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface FloatingBarAspectRatioOption {
  value: string;
  label: string;
  /** Optional visual indicator (e.g. a small framed div). */
  icon?: ReactNode;
}

interface FloatingGenerateBarProps {
  // --- Layout ---
  /** Outer card className (controls bg / padding / max-width / border).
   *  Caller positions the bar with its own wrapper div. */
  className?: string;
  /** Pill/select trigger background — varies between solid / glass variants. */
  pillBg?: string;
  /** Disable BorderGlow (e.g. inline non-floating state). */
  hideBorderGlow?: boolean;
  /** Optional child slot rendered inside the card (e.g. drag-and-drop overlay). */
  children?: ReactNode;

  // --- Media type toggle ---
  mediaType: 'image' | 'video';
  onSwitchMediaType: (next: 'image' | 'video') => void;
  /** Hide the image/video toggle (e.g. on a model-specific page). */
  hideMediaTypeToggle?: boolean;

  // --- Prompt ---
  prompt: string;
  onPromptChange: (value: string) => void;
  promptPlaceholder?: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  textareaMinHeightClass?: string;
  /** Optional image URL passed to PromptOptimizer for img2X enhancement. */
  promptOptimizerImageUrl?: string;
  /** Disables the entire bar (textarea, selects, generate button). */
  disabled?: boolean;

  // --- Model selection ---
  selectedModel: string;
  modelOptions: FloatingBarModelOption[];
  onModelChange: (modelId: string) => void;
  /** Optional custom dropdown item renderer (logos, per-model credits). */
  renderModelOption?: (option: FloatingBarModelOption) => ReactNode;

  // --- Aspect ratio ---
  aspectRatio: string;
  aspectRatioOptions: FloatingBarAspectRatioOption[];
  onAspectRatioChange: (ar: string) => void;

  // --- Image-only: resolution (pro models) ---
  imageResolution?: string;
  imageResolutionOptions?: { value: string; label: string }[];
  onImageResolutionChange?: (res: string) => void;

  // --- Video-only: duration ---
  videoDuration?: string;
  videoDurationOptions?: number[];
  onVideoDurationChange?: (d: string) => void;

  // --- Video-only: resolution ---
  videoResolution?: string;
  videoResolutionOptions?: string[];
  onVideoResolutionChange?: (r: string) => void;
  /** Resolutions in `videoResolutionOptions` that are subscriber-only.
   *  Renders a crown badge and routes clicks to `onLockedVideoResolution`
   *  instead of `onVideoResolutionChange`. */
  lockedVideoResolutions?: string[];
  onLockedVideoResolution?: (r: string) => void;

  // --- Video-only: audio ---
  showAudioToggle?: boolean;
  generateAudio?: boolean;
  onGenerateAudioChange?: (enabled: boolean) => void;

  // --- Upload slots ---
  img2imgInputs: UploadedImage[];
  onImg2imgInputsChange: (imgs: UploadedImage[]) => void;
  img2vidFirstFrameInputs: UploadedImage[];
  onImg2vidFirstFrameInputsChange: (imgs: UploadedImage[]) => void;
  img2vidLastFrameInputs: UploadedImage[];
  onImg2vidLastFrameInputsChange: (imgs: UploadedImage[]) => void;
  /** Whether the current video model supports an optional last frame. */
  showLastFrameSlot?: boolean;
  /** Max source images for image-to-image (default 1, like /app). Marketing
   *  pages can pass higher to support multi-reference models like Nano Banana. */
  maxImg2imgInputs?: number;

  // --- Video sub-mode (image-to-video vs reference-to-video) ---
  /** Show the Image-to-Video / Reference-to-Video toggle when in video mode.
   *  Only the marketing pages currently use this; /app keeps it hidden. */
  showVideoSubModeToggle?: boolean;
  /** Current video sub-mode. Required when `showVideoSubModeToggle` is true. */
  videoSubMode?: 'image' | 'reference';
  onVideoSubModeChange?: (mode: 'image' | 'reference') => void;
  /** Reference-image inputs (used when `videoSubMode === 'reference'`). */
  referenceInputs?: UploadedImage[];
  onReferenceInputsChange?: (imgs: UploadedImage[]) => void;
  /** Max reference images. Defaults to 3 (Veo3 R2V cap). */
  maxReferenceInputs?: number;

  // --- Submit ---
  requiredCredits: number;
  canGenerate: boolean;
  onGenerate: () => void;
  generateLabel?: string;

  // --- Optional extra controls slot ---
  /** Extra pill controls injected after the built-in pills (e.g. reference
   *  upload, settings gear). Rendered inside the bottom-controls flex row,
   *  before the Generate button. */
  extraControls?: ReactNode;
}

const DEFAULT_PILL_BG = 'bg-secondary/50';

type PromptAssetTab = 'all' | 'image' | 'video';

function PromptAssetPreview({
  asset,
  mediaUrl,
  thumb,
}: {
  asset: Asset;
  mediaUrl: string;
  thumb: string;
}) {
  if (asset.type === 'video') {
    return (
      <video
        src={mediaUrl}
        poster={thumb !== mediaUrl ? thumb : undefined}
        className="size-full object-cover"
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          if (video.poster || !Number.isFinite(video.duration)) return;
          try {
            video.currentTime = Math.min(0.1, video.duration / 2);
          } catch {
            // Some remote video hosts reject seeking before enough data loads.
          }
        }}
      />
    );
  }

  return (
    <img
      src={thumb}
      alt=""
      className="size-full object-cover"
      loading="lazy"
      decoding="async"
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
    />
  );
}

interface PromptAssetMentionPickerProps {
  open: boolean;
  tab: PromptAssetTab;
  onTabChange: (tab: PromptAssetTab) => void;
  onAssetSelect: (asset: Asset) => void;
}

function PromptAssetMentionPicker({
  open,
  tab,
  onTabChange,
  onAssetSelect,
}: PromptAssetMentionPickerProps) {
  const assetQueryType: 'all' | AssetType = tab === 'all' ? 'all' : tab;
  const { data, isLoading } = useAssets({
    type: assetQueryType,
    sort: 'latest',
    pageSize: 12,
    enabled: open,
  });

  const assets = useMemo(
    () =>
      (data?.pages.flatMap((page) => page.assets) ?? [])
        .filter((asset) => asset.type === 'image' || asset.type === 'video')
        .slice(0, 12),
    [data]
  );

  if (!open) return null;

  return (
    <div className="absolute left-0 right-0 bottom-full z-50 mb-3 overflow-hidden rounded-lg border border-white/10 bg-[#171717]/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between border-white/10 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <AtSign className="size-3.5" />
          <span>Insert asset</span>
        </div>
        <div className="flex rounded-md bg-white/5 p-0.5">
          {[
            ['all', 'Recent'],
            ['image', 'Images'],
            ['video', 'Videos'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onTabChange(value as PromptAssetTab)}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                tab === value
                  ? 'bg-white/15 text-white'
                  : 'text-muted-foreground hover:text-white'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[260px] overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex h-28 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : assets.length > 0 ? (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {assets.map((asset) => {
              const mediaUrl = getAssetMediaUrl(asset);
              const thumb = getAssetThumbnailUrl(asset) ?? mediaUrl;
              if (!mediaUrl || !thumb) return null;

              return (
                <button
                  key={asset.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onAssetSelect(asset)}
                  className="group relative aspect-square overflow-hidden rounded-md bg-white/5 ring-1 ring-white/10 transition hover:ring-white/35"
                  aria-label={`Insert ${asset.type} asset`}
                >
                  <PromptAssetPreview
                    asset={asset}
                    mediaUrl={mediaUrl}
                    thumb={thumb}
                  />
                  <span className="absolute right-1 bottom-1 rounded bg-black/70 p-1 text-white">
                    {asset.type === 'video' ? (
                      <VideoIcon className="size-3" />
                    ) : (
                      <ImageIcon className="size-3" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex h-28 items-center justify-center text-muted-foreground text-sm">
            No assets yet
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Pure presentational floating generate bar — same UI used by `/app`'s
 * `AppFloatingBar` and the marketing pages' `AIWorkspace` input card.
 *
 * No store/hook reads — all state is injected via props. Callers are
 * responsible for positioning the bar (the component only renders the styled
 * card itself).
 */
export const FloatingGenerateBar: ComponentType<FloatingGenerateBarProps> =
  function FloatingGenerateBar({
    className,
    pillBg = DEFAULT_PILL_BG,
    hideBorderGlow = false,
    children,
    mediaType,
    onSwitchMediaType,
    hideMediaTypeToggle = false,
    prompt,
    onPromptChange,
    promptPlaceholder = 'Enter your idea to generate...',
    textareaRef,
    textareaMinHeightClass = 'min-h-[56px]',
    promptOptimizerImageUrl,
    disabled = false,
    selectedModel,
    modelOptions,
    onModelChange,
    renderModelOption,
    aspectRatio,
    aspectRatioOptions,
    onAspectRatioChange,
    imageResolution,
    imageResolutionOptions,
    onImageResolutionChange,
    videoDuration,
    videoDurationOptions,
    onVideoDurationChange,
    videoResolution,
    videoResolutionOptions,
    onVideoResolutionChange,
    lockedVideoResolutions,
    onLockedVideoResolution,
    showAudioToggle = false,
    generateAudio = false,
    onGenerateAudioChange,
    img2imgInputs,
    onImg2imgInputsChange,
    img2vidFirstFrameInputs,
    onImg2vidFirstFrameInputsChange,
    img2vidLastFrameInputs,
    onImg2vidLastFrameInputsChange,
    showLastFrameSlot = false,
    maxImg2imgInputs = 1,
    showVideoSubModeToggle = false,
    videoSubMode = 'image',
    onVideoSubModeChange,
    referenceInputs = [],
    onReferenceInputsChange,
    maxReferenceInputs = 3,
    requiredCredits,
    canGenerate,
    onGenerate,
    generateLabel = 'Generate',
    extraControls,
  }) {
    const isImage = mediaType === 'image';
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [assetPickerTab, setAssetPickerTab] = useState<PromptAssetTab>('all');

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (assetPickerOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setAssetPickerOpen(false);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (canGenerate && !disabled) {
          onGenerate();
        }
      }
    };

    const removeTrailingAt = useCallback((value: string) => {
      const atIndex = value.lastIndexOf('@');
      if (atIndex === -1) return value;

      const suffix = value.slice(atIndex + 1);
      if (/\s/.test(suffix)) return value;

      return `${value.slice(0, atIndex)}${value.slice(atIndex + 1)}`;
    }, []);

    const handlePromptChange = useCallback(
      (value: string) => {
        onPromptChange(value);
        const atIndex = value.lastIndexOf('@');
        const suffix = atIndex === -1 ? '' : value.slice(atIndex + 1);
        setAssetPickerOpen(atIndex !== -1 && !/\s/.test(suffix));
      },
      [onPromptChange]
    );

    const addImageAssetToInput = useCallback(
      (assetUrl: string) => {
        const newImage: UploadedImage = {
          id: crypto.randomUUID(),
          file: null as unknown as File,
          previewUrl: assetUrl,
          r2Url: assetUrl,
          uploading: false,
        };

        if (isImage) {
          if (img2imgInputs.length >= maxImg2imgInputs) return false;
          onImg2imgInputsChange([...img2imgInputs, newImage]);
          return true;
        }

        if (videoSubMode === 'reference' && onReferenceInputsChange) {
          if (referenceInputs.length >= maxReferenceInputs) return false;
          onReferenceInputsChange([...referenceInputs, newImage]);
          return true;
        }

        if (img2vidFirstFrameInputs.length === 0) {
          onImg2vidFirstFrameInputsChange([newImage]);
          return true;
        }

        if (showLastFrameSlot && img2vidLastFrameInputs.length === 0) {
          onImg2vidLastFrameInputsChange([newImage]);
          return true;
        }

        return false;
      },
      [
        img2imgInputs,
        img2vidFirstFrameInputs,
        img2vidLastFrameInputs,
        isImage,
        maxImg2imgInputs,
        maxReferenceInputs,
        onImg2imgInputsChange,
        onImg2vidFirstFrameInputsChange,
        onImg2vidLastFrameInputsChange,
        onReferenceInputsChange,
        referenceInputs,
        showLastFrameSlot,
        videoSubMode,
      ]
    );

    const handleAssetMentionSelect = useCallback(
      (asset: Asset) => {
        const mediaUrl = getAssetMediaUrl(asset);
        if (!mediaUrl) return;

        if (asset.type === 'image') {
          addImageAssetToInput(mediaUrl);
          onPromptChange(removeTrailingAt(prompt));
        } else {
          const label = asset.title || asset.prompt || 'video asset';
          const nextPrompt =
            `${removeTrailingAt(prompt).trimEnd()} @${label.slice(0, 48)} ${mediaUrl}`.trimStart();
          onPromptChange(nextPrompt);
        }

        setAssetPickerOpen(false);
        textareaRef?.current?.focus();
      },
      [
        addImageAssetToInput,
        onPromptChange,
        prompt,
        removeTrailingAt,
        textareaRef,
      ]
    );

    return (
      <div
        className={cn(
          'relative mx-auto max-w-[900px] rounded-xl bg-sidebar/40 p-3 shadow-2xl backdrop-blur-2xl md:p-4',
          className
        )}
      >
        {!hideBorderGlow && <BorderGlow radius="rounded-xl" />}
        {children}

        {/* Top row: media type toggle + prompt optimizer */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {!hideMediaTypeToggle && (
              <div
                className={cn('flex items-center gap-1 rounded-lg p-1', pillBg)}
              >
                <button
                  type="button"
                  onClick={() => onSwitchMediaType('image')}
                  aria-label="Switch to image generation"
                  aria-pressed={isImage}
                  disabled={disabled}
                  className={cn(
                    'rounded-md p-2 transition-colors cursor-pointer',
                    isImage
                      ? 'bg-background shadow-sm ring-1 ring-blue-500/50'
                      : 'hover:bg-background/50'
                  )}
                >
                  <ImageIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchMediaType('video')}
                  aria-label="Switch to video generation"
                  aria-pressed={!isImage}
                  disabled={disabled}
                  className={cn(
                    'rounded-md p-2 transition-colors cursor-pointer',
                    !isImage
                      ? 'bg-background shadow-sm ring-1 ring-blue-500/50'
                      : 'hover:bg-background/50'
                  )}
                >
                  <VideoIcon className="size-4" />
                </button>
              </div>
            )}
          </div>

          <PromptOptimizer
            mediaType={mediaType}
            prompt={prompt}
            onPromptChange={onPromptChange}
            imageUrl={promptOptimizerImageUrl}
            disabled={disabled}
          />
        </div>

        {/* Middle row: upload tile(s) on the left, prompt textarea on the right. */}
        <div className="mt-2 flex items-center gap-3">
          {isImage ? (
            <CompactImageInput
              images={img2imgInputs}
              onImagesChange={onImg2imgInputsChange}
              maxImages={maxImg2imgInputs}
              intent="image-input"
              ariaLabel="Add source image"
              hoverEffect="straighten"
              disabled={disabled}
            />
          ) : videoSubMode === 'reference' && onReferenceInputsChange ? (
            <CompactImageInput
              images={referenceInputs}
              onImagesChange={onReferenceInputsChange}
              maxImages={maxReferenceInputs}
              intent="video-reference"
              ariaLabel="Add reference image"
              label="Ref"
              hoverEffect="straighten"
              disabled={disabled}
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <CompactImageInput
                images={img2vidFirstFrameInputs}
                onImagesChange={onImg2vidFirstFrameInputsChange}
                maxImages={1}
                intent="video-frame"
                ariaLabel="Add first frame"
                label="First"
                tilt="left"
                disabled={disabled}
              />
              {showLastFrameSlot && (
                <>
                  <ArrowLeftRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground/60"
                  />
                  <CompactImageInput
                    images={img2vidLastFrameInputs}
                    onImagesChange={onImg2vidLastFrameInputsChange}
                    maxImages={1}
                    intent="video-frame"
                    ariaLabel="Add last frame (optional)"
                    label="Last"
                    tilt="right"
                    disabled={disabled}
                  />
                </>
              )}
            </div>
          )}
          <div className="relative flex-1">
            <PromptAssetMentionPicker
              open={assetPickerOpen && !disabled}
              tab={assetPickerTab}
              onTabChange={setAssetPickerTab}
              onAssetSelect={handleAssetMentionSelect}
            />
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={promptPlaceholder}
              disabled={disabled}
              className={cn(
                'max-h-60 overflow-y-auto resize-none border-none bg-transparent p-0 text-base leading-snug shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent',
                textareaMinHeightClass
              )}
              maxLength={4000}
            />
          </div>
        </div>

        {/* Bottom controls — pill selectors + generate button */}
        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Model selector */}
            <Select
              value={selectedModel}
              onValueChange={onModelChange}
              disabled={disabled}
            >
              <SelectTrigger
                className={cn(
                  'h-9 sm:h-10 w-auto gap-2 rounded-full px-2.5 sm:px-4 text-xs sm:text-sm',
                  pillBg
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {renderModelOption ? (
                      renderModelOption(opt)
                    ) : (
                      <span className="flex items-center gap-2">
                        {opt.icon ? <span>{opt.icon}</span> : null}
                        <span>{opt.label}</span>
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Video sub-mode (Image-to-Video / Reference-to-Video) */}
            {!isImage && showVideoSubModeToggle && onVideoSubModeChange && (
              <Select
                value={videoSubMode}
                onValueChange={(v) =>
                  onVideoSubModeChange(v as 'image' | 'reference')
                }
                disabled={disabled}
              >
                <SelectTrigger
                  className={cn(
                    'h-9 sm:h-10 w-auto gap-2 rounded-full px-2.5 sm:px-4 text-xs sm:text-sm',
                    pillBg
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Image to Video</SelectItem>
                  <SelectItem value="reference">Reference to Video</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Aspect ratio */}
            <Select
              value={aspectRatio}
              onValueChange={onAspectRatioChange}
              disabled={disabled}
            >
              <SelectTrigger
                className={cn(
                  'h-9 sm:h-10 w-auto sm:w-[120px] gap-2 rounded-full px-2.5 sm:px-4 text-xs sm:text-sm',
                  pillBg
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aspectRatioOptions.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    <span className="flex items-center gap-2">
                      {r.icon}
                      <span>{r.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Image-only: resolution (pro models) */}
            {isImage &&
              imageResolution &&
              imageResolutionOptions &&
              onImageResolutionChange && (
                <Select
                  value={imageResolution}
                  onValueChange={onImageResolutionChange}
                  disabled={disabled}
                >
                  <SelectTrigger
                    className={cn(
                      'h-9 sm:h-10 w-auto gap-2 rounded-full px-2.5 sm:px-4 text-xs sm:text-sm',
                      pillBg
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {imageResolutionOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

            {/* Video-only: duration */}
            {!isImage &&
              videoDuration &&
              videoDurationOptions &&
              onVideoDurationChange && (
                <Select
                  value={videoDuration}
                  onValueChange={onVideoDurationChange}
                  disabled={disabled}
                >
                  <SelectTrigger
                    className={cn(
                      'h-9 sm:h-10 w-auto gap-2 rounded-full px-2.5 sm:px-4 text-xs sm:text-sm',
                      pillBg
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {videoDurationOptions.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} sec
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

            {/* Video-only: resolution */}
            {!isImage &&
              videoResolution &&
              videoResolutionOptions &&
              onVideoResolutionChange && (
                <Select
                  value={videoResolution}
                  onValueChange={(next) => {
                    if (lockedVideoResolutions?.includes(next)) {
                      onLockedVideoResolution?.(next);
                      return;
                    }
                    onVideoResolutionChange(next);
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger
                    className={cn(
                      'h-9 sm:h-10 w-auto gap-2 rounded-full px-2.5 sm:px-4 text-xs sm:text-sm',
                      pillBg
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {videoResolutionOptions.map((r) => {
                      const locked = lockedVideoResolutions?.includes(r);
                      return (
                        <SelectItem key={r} value={r}>
                          <span className="inline-flex items-center gap-1">
                            <span>{r}</span>
                            {locked && (
                              <Crown
                                aria-hidden
                                className="size-3 text-amber-500"
                                strokeWidth={2.5}
                              />
                            )}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}

            {/* Video-only: audio toggle */}
            {!isImage && showAudioToggle && onGenerateAudioChange && (
              <button
                type="button"
                onClick={() => onGenerateAudioChange(!generateAudio)}
                aria-pressed={generateAudio}
                disabled={disabled}
                className={cn(
                  'h-9 sm:h-10 shrink-0 gap-2 rounded-full px-3 sm:px-4 text-xs sm:text-sm inline-flex items-center transition-colors',
                  generateAudio
                    ? 'bg-white/15 text-white ring-1 ring-white/25'
                    : cn(pillBg, 'text-muted-foreground hover:bg-secondary/70')
                )}
              >
                {generateAudio ? 'Audio on' : 'Audio off'}
              </button>
            )}

            {extraControls}
          </div>

          {/* Generate button */}
          <Button
            variant="generate"
            data-active={canGenerate && !disabled}
            onClick={onGenerate}
            className="h-9 sm:h-10 gap-2 rounded-full px-4 sm:px-6 text-xs sm:text-sm"
            disabled={!canGenerate || disabled}
          >
            {generateLabel}
            <span className="flex items-center gap-0.5 text-xs">
              <CoinsIcon className="size-3" />
              {requiredCredits}
            </span>
          </Button>
        </div>
      </div>
    );
  };
