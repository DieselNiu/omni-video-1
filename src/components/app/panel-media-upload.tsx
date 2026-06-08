'use client';

import { useUploadLoginGate } from '@/hooks/use-upload-login-gate';
import { cn } from '@/lib/utils';
import { AuthRequiredError, uploadFileFromBrowser } from '@/storage/client';
import type { UploadIntent } from '@/storage/intents';
import { registerUpload } from '@/storage/pending-uploads';
import { useLoginDialogStore } from '@/stores/login-dialog-store';
import { FileAudio, FileVideo, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { UploadedImage } from './image-upload-area';

interface PanelMediaUploadProps {
  media: UploadedImage[];
  onMediaChange: (media: UploadedImage[]) => void;
  kind: 'video' | 'audio';
  intent: UploadIntent;
  allowedTypes: readonly string[];
  maxFileSize: number;
  maxItems?: number;
  totalDurationLimitSeconds?: number;
  formatLabel?: string;
  title?: string;
  /** Called right before the login dialog is shown for a guest (e.g. to
   *  stash the prompt so it survives the OAuth reload). */
  onRequireLogin?: () => void;
}

function measureDuration(file: File, kind: 'video' | 'audio'): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    el.preload = 'metadata';
    const cleanup = () => URL.revokeObjectURL(url);
    el.onloadedmetadata = () => {
      const duration = Number.isFinite(el.duration) ? el.duration : 0;
      cleanup();
      resolve(duration);
    };
    el.onerror = () => {
      cleanup();
      resolve(0);
    };
    el.src = url;
  });
}

export function PanelMediaUpload({
  media,
  onMediaChange,
  kind,
  intent,
  allowedTypes,
  maxFileSize,
  maxItems = 3,
  totalDurationLimitSeconds,
  formatLabel,
  title,
  onRequireLogin,
}: PanelMediaUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const gateUpload = useUploadLoginGate();
  const [durations, setDurations] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef(media);
  mediaRef.current = media;

  const totalDuration = useMemo(
    () =>
      media.reduce(
        (sum, item) => sum + (durations[item.id] ?? item.durationSeconds ?? 0),
        0
      ),
    [media, durations]
  );

  const updateItem = useCallback(
    (id: string, update: Partial<UploadedImage>) => {
      onMediaChange(
        mediaRef.current.map((item) =>
          item.id === id ? { ...item, ...update } : item
        )
      );
    },
    [onMediaChange]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const selected = Array.from(files);
      const noun = kind === 'video' ? 'videos' : 'audio clips';
      const remaining = maxItems - mediaRef.current.length;
      if (remaining <= 0) {
        toast(`You can add at most ${maxItems} ${noun}.`);
        return;
      }

      const droppedForCount = selected.length > remaining;
      let droppedForType = false;
      let droppedForSize = false;
      const valid: File[] = [];
      for (const file of selected.slice(0, remaining)) {
        if (!allowedTypes.includes(file.type)) {
          droppedForType = true;
          continue;
        }
        if (file.size > maxFileSize) {
          droppedForSize = true;
          continue;
        }
        valid.push(file);
      }
      if (droppedForType) {
        toast(
          `Unsupported format. Allowed: ${formatLabel ?? allowedTypes.join(', ')}.`
        );
      }
      if (droppedForSize) {
        toast(
          `Each ${kind} must be <= ${Math.round(maxFileSize / (1024 * 1024))}MB.`
        );
      }
      if (droppedForCount) {
        toast(`You can add at most ${maxItems} ${noun}.`);
      }
      if (valid.length === 0) return;

      const limit = totalDurationLimitSeconds;
      const accepted: { file: File; duration: number }[] = [];
      let running = totalDuration;
      let droppedForDuration = false;
      for (const file of valid) {
        const duration =
          limit !== undefined ? await measureDuration(file, kind) : 0;
        if (limit !== undefined && running + duration > limit + 0.05) {
          droppedForDuration = true;
          continue;
        }
        running += duration;
        accepted.push({ file, duration });
      }
      if (droppedForDuration && limit !== undefined) {
        toast(`Total ${noun} duration can't exceed ${limit}s.`);
      }
      if (accepted.length === 0) return;

      const newItems = accepted.map(({ file, duration }) => {
        const id = crypto.randomUUID();
        return {
          item: {
            id,
            file,
            previewUrl: URL.createObjectURL(file),
            uploading: true,
            durationSeconds: duration,
          } as UploadedImage,
          duration,
        };
      });

      setDurations((prev) => {
        const next = { ...prev };
        for (const { item, duration } of newItems) next[item.id] = duration;
        return next;
      });
      onMediaChange([...mediaRef.current, ...newItems.map((n) => n.item)]);

      await Promise.all(
        newItems.map(({ item }) => {
          const uploadPromise = uploadFileFromBrowser(item.file, intent)
            .then((result) => {
              updateItem(item.id, { r2Url: result.url, uploading: false });
              return result.url;
            })
            .catch((error) => {
              if (error instanceof AuthRequiredError) {
                // Guest/expired session: prompt login instead of a dead
                // "upload failed" tile. Drop the optimistic item so the
                // user can re-pick the file after signing in.
                useLoginDialogStore.getState().openLoginDialog('feature_gated');
                URL.revokeObjectURL(item.previewUrl);
                onMediaChange(mediaRef.current.filter((i) => i.id !== item.id));
                return null;
              }
              updateItem(item.id, {
                uploading: false,
                error: 'Upload failed',
              });
              return null;
            });
          registerUpload(item.id, uploadPromise);
          return uploadPromise;
        })
      );
    },
    [
      maxItems,
      allowedTypes,
      maxFileSize,
      formatLabel,
      totalDurationLimitSeconds,
      totalDuration,
      kind,
      onMediaChange,
      intent,
      updateItem,
    ]
  );

  const removeItem = useCallback(
    (id: string) => {
      const item = media.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      setDurations((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      onMediaChange(media.filter((i) => i.id !== id));
    },
    [media, onMediaChange]
  );

  useEffect(() => {
    return () => {
      for (const item of mediaRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      // Login-required intent + guest → prompt login instead of accepting
      // the dropped file (which would just 401).
      if (!gateUpload(intent, onRequireLogin)) return;
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    },
    [handleFiles, gateUpload, intent, onRequireLogin]
  );

  // Pop the login dialog the moment a guest clicks upload, before the file
  // picker opens.
  const openFilePicker = useCallback(() => {
    if (!gateUpload(intent, onRequireLogin)) return;
    inputRef.current?.click();
  }, [gateUpload, intent, onRequireLogin]);

  const remainingCount = maxItems - media.length;
  const canAddMore = remainingCount > 0;
  const Icon = kind === 'video' ? FileVideo : FileAudio;
  const baseTitle =
    title ?? (kind === 'video' ? 'Reference Videos' : 'Reference Audios');
  const constraint =
    totalDurationLimitSeconds !== undefined
      ? `(max ${maxItems}, total ${totalDurationLimitSeconds}s)`
      : `(max ${maxItems})`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">
          {baseTitle}{' '}
          <span className="font-normal text-muted-foreground">
            {constraint}
          </span>
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {totalDurationLimitSeconds !== undefined
            ? `${totalDuration.toFixed(1)}s/${totalDurationLimitSeconds}s`
            : `${media.length}/${maxItems}`}
        </span>
      </div>

      {media.length > 0 && (
        <div className="space-y-2">
          {media.map((item) => (
            <div
              key={item.id}
              className="group relative flex items-center gap-3 rounded-lg border bg-muted/40 p-2 dark:bg-foreground/[0.04]"
            >
              {kind === 'video' ? (
                <video
                  src={item.previewUrl}
                  controls
                  className="h-20 w-32 shrink-0 rounded-md bg-black object-cover"
                >
                  <track kind="captions" />
                </video>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="truncate text-xs text-foreground/80">
                    {item.file?.name ?? 'Audio'}
                  </span>
                  {/* biome-ignore lint/a11y/useMediaCaption: user-supplied reference audio has no captions */}
                  <audio src={item.previewUrl} controls className="w-full" />
                </div>
              )}
              {durations[item.id] ? (
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {durations[item.id].toFixed(1)}s
                </span>
              ) : null}
              {item.uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                  <Loader2 className="size-4 animate-spin text-white" />
                </div>
              )}
              {item.error && (
                <span className="text-[11px] text-red-500">{item.error}</span>
              )}
              <button
                type="button"
                className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => removeItem(item.id)}
                aria-label={`Remove ${kind}`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {canAddMore && (
        // biome-ignore lint/a11y/useSemanticElements: dropzone needs key + drag handlers, not a plain button.
        <div
          role="button"
          tabIndex={0}
          aria-label={`Click or drag to upload a ${kind}`}
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
            'relative flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-6 transition-colors',
            'bg-muted/40 dark:bg-foreground/[0.04]',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-foreground/20 hover:border-foreground/40 hover:bg-muted/60 dark:hover:bg-foreground/[0.06]'
          )}
        >
          <div className="flex size-10 items-center justify-center rounded-lg bg-foreground/10 text-foreground/80">
            <Icon className="size-5" />
          </div>
          <span className="text-center text-sm font-medium text-foreground/80">
            Click to upload {kind === 'video' ? 'videos' : 'audio'}
          </span>
          <span className="text-[11px] text-muted-foreground/70">
            {formatLabel ? `${formatLabel} ` : ''}({remainingCount} remaining)
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={allowedTypes.join(',')}
            multiple={maxItems > 1}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}
