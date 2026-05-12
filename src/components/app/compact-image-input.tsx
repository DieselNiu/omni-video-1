'use client';

import { ImagePickerModal } from '@/components/image-picker/image-picker-modal';
import { cn } from '@/lib/utils';
import { uploadFileFromBrowser } from '@/storage/client';
import type { UploadIntent } from '@/storage/intents';
import { Loader2, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UploadedImage } from './image-upload-area';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface CompactImageInputProps {
  images: UploadedImage[];
  onImagesChange: (images: UploadedImage[]) => void;
  maxImages?: number;
  intent: UploadIntent;
  disabled?: boolean;
  /** Optional aria-label for the empty add button */
  ariaLabel?: string;
  /** Tiny label rendered inside the empty tile, under the + glyph.
   *  Used when there are multiple slots side-by-side (first / last frame) */
  label?: string;
  /** Direction of the static tilt on the empty tile. Defaults to 'left'. */
  tilt?: 'left' | 'right';
  /** What the empty tile does on hover. 'scale' grows it 10% (good for
   *  paired tiles like first/last frame); 'straighten' rotates back to
   *  0deg (good for a single solo tile in image mode). Default 'scale'. */
  hoverEffect?: 'scale' | 'straighten';
}

/**
 * Square "+" upload tile for the floating bar.
 *
 * One square cell per slot. Empty slots show a dashed-border "+" button;
 * filled slots show the image thumbnail with a hover × to remove. Cells
 * stack horizontally and are intended to live inline beside the prompt
 * textarea, taking minimal width so the textarea still gets the lion's
 * share of the row.
 *
 * Underlying upload mechanics are the same as ImageUploadArea (file
 * picker → upload to R2 → object-URL preview → swap to r2Url) so the
 * floating bar and the left panel share state seamlessly.
 */
export function CompactImageInput({
  images,
  onImagesChange,
  maxImages = 5,
  intent,
  disabled,
  ariaLabel = 'Add image',
  label,
  tilt = 'left',
  hoverEffect = 'scale',
}: CompactImageInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
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
        if (file.size > MAX_FILE_SIZE) return false;
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

      for (const img of newImages) {
        try {
          const result = await uploadFileFromBrowser(img.file, intent);
          updateImage(img.id, { r2Url: result.url, uploading: false });
        } catch {
          updateImage(img.id, { uploading: false, error: 'Upload failed' });
        }
      }
    },
    [maxImages, onImagesChange, intent, updateImage]
  );

  const removeImage = useCallback(
    (id: string) => {
      const img = images.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      onImagesChange(images.filter((i) => i.id !== id));
    },
    [images, onImagesChange]
  );

  // Picking an asset from the picker modal: it's already in R2, so skip
  // the upload step and just push it into the images array with r2Url
  // pre-set. Same pattern as ai-workspace.tsx:1065 handleImagePickerSelect.
  const handleAssetSelect = useCallback(
    (assetUrl: string) => {
      if (imagesRef.current.length >= maxImages) return;
      const newImage: UploadedImage = {
        id: crypto.randomUUID(),
        // No File for assets — they came from the user's history.
        file: null as unknown as File,
        previewUrl: assetUrl,
        r2Url: assetUrl,
        uploading: false,
      };
      onImagesChange([...imagesRef.current, newImage]);
    },
    [maxImages, onImagesChange]
  );

  // Plus button → open the asset picker modal. The modal lets the user
  // either upload a new file or pick from their generation history.
  const handleAddClick = useCallback(() => {
    setPickerOpen(true);
  }, []);

  // Modal "Upload" tile → trigger the hidden native file input.
  const handlePickerUpload = useCallback(() => {
    inputRef.current?.click();
  }, []);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      for (const img of imagesRef.current) {
        URL.revokeObjectURL(img.previewUrl);
      }
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
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
        disabled={disabled}
      />

      {/* Square thumbnails for uploaded images */}
      {images.map((img) => (
        <div
          key={img.id}
          className="group relative h-14 w-12 shrink-0 overflow-hidden bg-muted shadow-sm"
        >
          <img
            src={img.previewUrl}
            alt="Upload preview"
            className="size-full object-cover"
          />
          {img.uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="size-4 animate-spin text-white" />
            </div>
          )}
          {img.error && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-500/60">
              <span className="text-[10px] text-white">Error</span>
            </div>
          )}
          {!img.uploading && !img.error && (
            <button
              type="button"
              onClick={() => removeImage(img.id)}
              disabled={disabled}
              className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove image"
            >
              <X className="size-4 text-white" />
            </button>
          )}
        </div>
      ))}

      {/* Square "+" add button — hidden once the user has reached maxImages */}
      {images.length < maxImages && (
        <button
          type="button"
          onClick={handleAddClick}
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'flex h-14 w-12 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 border-2 border-dashed border-white/30 bg-foreground/[0.05] shadow-sm transition-transform hover:border-white/50 hover:bg-foreground/[0.08] disabled:cursor-not-allowed disabled:opacity-50',
            tilt === 'left' ? '-rotate-3' : 'rotate-3',
            hoverEffect === 'scale' ? 'hover:scale-110' : 'hover:rotate-0'
          )}
        >
          <Plus className="size-4 text-muted-foreground" />
          {label && (
            <span className="text-[10px] leading-none text-muted-foreground">
              {label}
            </span>
          )}
        </button>
      )}

      {/* Asset picker modal — same one /image and /video use. Lets the
          user either upload a new file or reuse a previous generation. */}
      <ImagePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onImageSelect={handleAssetSelect}
        onUploadClick={handlePickerUpload}
      />
    </div>
  );
}
