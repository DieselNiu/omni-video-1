'use client';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { X } from 'lucide-react';

interface UploadedImagePreviewDialogProps {
  src: string | null;
  alt?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadedImagePreviewDialog({
  src,
  alt = 'Uploaded image preview',
  open,
  onOpenChange,
}: UploadedImagePreviewDialogProps) {
  return (
    <Dialog open={open && !!src} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-[82vh] w-[92vw] max-w-5xl overflow-hidden border-white/10 bg-black p-0 shadow-2xl"
      >
        <DialogTitle className="sr-only">Uploaded image preview</DialogTitle>
        <DialogClose className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white/70">
          <X className="size-5" />
          <span className="sr-only">Close</span>
        </DialogClose>
        <div className="flex size-full items-center justify-center bg-black">
          {src && (
            <img
              src={src}
              alt={alt}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
