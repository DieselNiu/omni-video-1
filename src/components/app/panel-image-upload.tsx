'use client';

import { ImagePickerModal } from '@/components/image-picker/image-picker-modal';
import { useUploadLoginGate } from '@/hooks/use-upload-login-gate';
import { cn } from '@/lib/utils';
import { AuthRequiredError, uploadFileFromBrowser } from '@/storage/client';
import { type UploadIntent, getUploadIntentConfig } from '@/storage/intents';
import { registerUpload } from '@/storage/pending-uploads';
import { useLoginDialogStore } from '@/stores/login-dialog-store';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UploadedImage } from './image-upload-area';
import { UploadedImagePreviewDialog } from './uploaded-image-preview-dialog';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface PanelImageUploadProps {
  images: UploadedImage[];
  onImagesChange: (images: UploadedImage[]) => void;
  maxImages?: number;
  intent: UploadIntent;
  /** Click handler for the "Generate an image first" link. When provided,
   *  renders the link inside the empty dropzone. */
  onGenerateFirst?: () => void;
  /** Header title shown above the dropzone. Defaults to "Upload". */
  title?: string;
  /** Optional right-aligned header slot (e.g. an "Add End Frame" switch).
   *  When provided, replaces the default `n / max` counter. */
  headerAction?: React.ReactNode;
  /** Compact variant — tighter padding, smaller icon/text, no footer
   *  note, no `n / max` counter. Used in side-by-side layouts (e.g.
   *  first + last frame). */
  compact?: boolean;
  /** Render an "(Optional)" hint inside the dropzone body. Used by the
   *  Last Frame tile so the optional marker stays inside the box and
   *  doesn't wrap the header title (which would break tile alignment
   *  with the First Frame card). */
  optional?: boolean;
}

/**
 * Image upload card used inside the left operation panel for img2img mode.
 *
 * Shape mirrors the spec screenshot: a tall rounded card with a centered
 * icon, "Click or drag to upload, or choose from My History" copy, and a
 * secondary "No ideas? Generate an image first >" link. "My History" opens
 * the same {@link ImagePickerModal} the floating bar uses; "Generate an
 * image first" hands off via the `onGenerateFirst` prop so the parent can
 * flip the panel mode back to text-to-image.
 *
 * Upload mechanics (file picker → R2 upload → object-URL preview → r2Url
 * swap) match {@link ImageUploadArea} so this component drops in wherever
 * an `UploadedImage[]` state lives.
 */
export function PanelImageUpload({
  images,
  onImagesChange,
  maxImages = 3,
  intent,
  onGenerateFirst,
  title = 'Upload',
  headerAction,
  compact = false,
  optional = false,
}: PanelImageUploadProps) {
  const intentConfig = getUploadIntentConfig(intent);
  const gateUpload = useUploadLoginGate();
  const [isDragging, setIsDragging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Always-latest ref so async upload callbacks update the right array.
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const updateImage = useCallback(
    (id: string, update: Partial<UploadedImage>) => {
      onImagesChange(
        imagesRef.current.map((i) => (i.id === id ? { ...i, ...update } : i))
      );
    },
    [onImagesChange]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const remaining = maxImages - imagesRef.current.length;
      if (remaining <= 0) return;

      const validFiles = fileArray.slice(0, remaining).filter((file) => {
        if (!ALLOWED_TYPES.includes(file.type)) return false;
        if (file.size > intentConfig.maxFileSize) return false;
        return true;
      });
      if (validFiles.length === 0) return;

      const newImages: UploadedImage[] = validFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        uploading: true,
      }));

      onImagesChange([...imagesRef.current, ...newImages]);

      // Upload all picked files in parallel (not one-at-a-time) and
      // register each in-flight upload so a "Generate" click can await it
      // optimistically instead of being blocked until the spinner clears.
      await Promise.all(
        newImages.map((img) => {
          const uploadPromise = uploadFileFromBrowser(img.file, intent)
            .then((result) => {
              updateImage(img.id, { r2Url: result.url, uploading: false });
              return result.url;
            })
            .catch((error) => {
              if (error instanceof AuthRequiredError) {
                useLoginDialogStore.getState().openLoginDialog('feature_gated');
                URL.revokeObjectURL(img.previewUrl);
                onImagesChange(
                  imagesRef.current.filter((i) => i.id !== img.id)
                );
                return null;
              }
              updateImage(img.id, { uploading: false, error: 'Upload failed' });
              return null;
            });
          registerUpload(img.id, uploadPromise);
          return uploadPromise;
        })
      );
    },
    [maxImages, onImagesChange, intent, intentConfig.maxFileSize, updateImage]
  );

  // Selection from the picker modal: asset is already in R2, so skip
  // upload and inject it directly with r2Url pre-set. Same shortcut the
  // floating bar uses (compact-image-input.tsx).
  const handleAssetSelect = useCallback(
    (assetUrl: string) => {
      if (imagesRef.current.length >= maxImages) return;
      const newImage: UploadedImage = {
        id: crypto.randomUUID(),
        file: null as unknown as File,
        previewUrl: assetUrl,
        r2Url: assetUrl,
        uploading: false,
      };
      onImagesChange([...imagesRef.current, newImage]);
    },
    [maxImages, onImagesChange]
  );

  const removeImage = useCallback(
    (id: string) => {
      const img = images.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      onImagesChange(images.filter((i) => i.id !== id));
    },
    [images, onImagesChange]
  );

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      for (const img of imagesRef.current) {
        URL.revokeObjectURL(img.previewUrl);
      }
    };
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (!gateUpload(intent)) return;
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles, gateUpload, intent]
  );

  // Pop the login dialog the moment a guest clicks upload (for
  // login-required intents), before the file picker opens.
  const openFilePicker = useCallback(() => {
    if (!gateUpload(intent)) return;
    inputRef.current?.click();
  }, [gateUpload, intent]);

  const canAddMore = images.length < maxImages;

  return (
    <div
      className={cn(
        'space-y-2',
        // In compact mode the component is typically placed inside a
        // stretched grid cell next to a sibling tile; becoming a flex
        // column lets the dropzone below absorb any extra height so
        // both tiles stay the same size even when one has an extra
        // "(Optional)" line.
        compact && 'flex h-full flex-col'
      )}
    >
      {/* Header: title + counter (or custom action). The counter is
          suppressed in compact mode — it's noise at maxImages=1 and
          would wrap to a second line in narrow side-by-side layouts,
          breaking vertical alignment between tiles. */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {headerAction ??
          (compact ? null : (
            <span className="text-xs text-muted-foreground">
              {images.length} / {maxImages}
            </span>
          ))}
      </div>

      {/* Uploaded previews */}
      {images.length > 0 && (
        <div
          className={cn(
            'flex flex-wrap gap-2',
            // In compact side-by-side layouts (First/Last Frame), let the
            // preview fill the tile and center both axes so the two
            // thumbnails hug the ⇄ connector instead of floating in the
            // top-left corners of their 1fr cells.
            compact && 'flex-1 items-center justify-center'
          )}
        >
          {images.map((img) => (
            <div
              key={img.id}
              className={cn(
                'group relative overflow-hidden rounded-md border',
                compact ? 'aspect-square w-full max-w-[160px]' : 'size-16'
              )}
            >
              <button
                type="button"
                className="size-full cursor-zoom-in"
                onClick={() => setPreviewImageUrl(img.previewUrl)}
                aria-label="Preview uploaded image"
              >
                <img
                  src={img.previewUrl}
                  alt="Upload preview"
                  className="size-full object-cover"
                />
              </button>
              {img.uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="size-4 animate-spin text-white" />
                </div>
              )}
              {img.error && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-500/50">
                  <span className="text-[10px] text-white">Error</span>
                </div>
              )}
              <button
                type="button"
                className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  removeImage(img.id);
                }}
                aria-label="Remove image"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone — empty state. Whole area is clickable to open file
          picker; nested "My History" + "Generate first" links stop
          propagation so they don't also fire the file picker. */}
      {canAddMore && (
        // biome-ignore lint/a11y/useSemanticElements: this dropzone contains nested action buttons, so a real button would be invalid HTML.
        <div
          role="button"
          tabIndex={0}
          aria-label="Click or drag to upload an image"
          onClick={openFilePicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openFilePicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'relative flex w-full min-w-0 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed transition-colors',
            compact ? 'flex-1 gap-2 px-3 py-5' : 'gap-3 px-6 py-7',
            'bg-muted/40 dark:bg-foreground/[0.04]',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-foreground/20 hover:border-foreground/40 hover:bg-muted/60 dark:hover:bg-foreground/[0.06]'
          )}
        >
          <div
            className={cn(
              'flex items-center justify-center rounded-lg bg-foreground/10 text-foreground/80',
              compact ? 'size-9' : 'size-11'
            )}
          >
            <ImagePlus className={compact ? 'size-4' : 'size-5'} />
          </div>
          <div
            className={cn(
              'text-center font-medium text-foreground/80',
              compact ? 'text-xs leading-snug' : 'text-sm'
            )}
          >
            {compact ? (
              <>
                Upload or pick from{' '}
                <button
                  type="button"
                  className="cursor-pointer font-semibold text-foreground underline underline-offset-2 hover:text-foreground/70"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPickerOpen(true);
                  }}
                >
                  History
                </button>
              </>
            ) : (
              <>
                Click or drag to upload, or choose from{' '}
                <button
                  type="button"
                  className="cursor-pointer font-semibold text-foreground underline underline-offset-2 hover:text-foreground/70"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPickerOpen(true);
                  }}
                >
                  My History
                </button>
              </>
            )}
          </div>
          {optional && (
            <span
              className={cn(
                'text-muted-foreground/70',
                compact ? 'text-[11px]' : 'text-xs'
              )}
            >
              (Optional)
            </span>
          )}
          {onGenerateFirst && (
            <button
              type="button"
              className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onGenerateFirst();
              }}
            >
              No ideas? Generate an image first &gt;
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            multiple={maxImages > 1}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {!compact && (
        <p className="text-[11px] text-muted-foreground/80">
          Support upload format: jpg, png, jpeg.
        </p>
      )}

      {/* Asset picker — same modal the floating bar uses. */}
      <ImagePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onImageSelect={handleAssetSelect}
        onUploadClick={openFilePicker}
      />
      <UploadedImagePreviewDialog
        src={previewImageUrl}
        open={!!previewImageUrl}
        onOpenChange={(open) => {
          if (!open) setPreviewImageUrl(null);
        }}
      />
    </div>
  );
}
