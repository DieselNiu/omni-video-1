'use client';

import { Button } from '@/components/ui/button';
import { Loader2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect } from 'react';

interface AssetDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function AssetDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  isDeleting = false,
}: AssetDeleteDialogProps) {
  const t = useTranslations('Dashboard.assets');

  const handleClose = useCallback(() => {
    if (!isDeleting) {
      onOpenChange(false);
    }
  }, [isDeleting, onOpenChange]);

  // Keyboard handling
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isDeleting, handleClose]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xl"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white">
          {t('deleteDialog.title')}
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          {t('deleteDialog.description')}
        </p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isDeleting}
            className="text-white hover:bg-zinc-800 hover:text-white"
          >
            {t('deleteDialog.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isDeleting ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                {t('deleteDialog.deleting')}
              </>
            ) : (
              t('deleteDialog.confirm')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
