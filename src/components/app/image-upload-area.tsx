'use client';

import { AuthRequiredError, uploadFileFromBrowser } from '@/storage/client';
import type { UploadIntent } from '@/storage/intents';
import { useLoginDialogStore } from '@/stores/login-dialog-store';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadedImagePreviewDialog } from './uploaded-image-preview-dialog';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface UploadedImage {
  id: string;
  file: File;
  previewUrl: string;
  r2Url?: string;
  uploading: boolean;
  error?: string;
  durationSeconds?: number;
}

interface ImageUploadAreaProps {
  images: UploadedImage[];
  onImagesChange: (images: UploadedImage[]) => void;
  maxImages?: number;
  intent: UploadIntent;
  label?: string;
  compact?: boolean;
}

export function ImageUploadArea({
  images,
  onImagesChange,
  maxImages = 5,
  intent,
  label = 'Upload Image',
  compact = false,
}: ImageUploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Use a ref to always have the latest images for async callbacks
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

      // Upload each file to R2
      for (const img of newImages) {
        try {
          const result = await uploadFileFromBrowser(img.file, intent);
          updateImage(img.id, { r2Url: result.url, uploading: false });
        } catch (error) {
          if (error instanceof AuthRequiredError) {
            useLoginDialogStore.getState().openLoginDialog('feature_gated');
            URL.revokeObjectURL(img.previewUrl);
            onImagesChange(imagesRef.current.filter((i) => i.id !== img.id));
            continue;
          }
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
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  return (
    <div className="space-y-2">
      {/* Uploaded previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div
              key={img.id}
              className="relative group size-16 rounded-md overflow-hidden border"
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
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="size-4 animate-spin text-white" />
                </div>
              )}
              {img.error && (
                <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center">
                  <span className="text-[10px] text-white">Error</span>
                </div>
              )}
              <button
                type="button"
                className="absolute top-0.5 right-0.5 size-4 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(event) => {
                  event.stopPropagation();
                  removeImage(img.id);
                }}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {images.length < maxImages && (
        <button
          type="button"
          className={`relative w-full rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          } ${compact ? 'p-3' : 'p-6'}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <ImagePlus className="size-5" />
            <span className="text-xs">{label}</span>
            <span className="text-[10px]">
              JPG, PNG, WebP {'\u00B7'} Max {maxImages}{' '}
              {maxImages === 1 ? 'image' : 'images'} {'\u00B7'} 10MB each
            </span>
          </div>
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
        </button>
      )}

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
