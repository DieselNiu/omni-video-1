'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Clock3, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface HomeCountdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  countdownSeconds: number;
  onUpgrade?: () => void;
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainder
    .toString()
    .padStart(2, '0')}`;
}

export function HomeCountdownDialog({
  open,
  onOpenChange,
  countdownSeconds,
  onUpgrade,
}: HomeCountdownDialogProps) {
  const t = useTranslations('HomeQuota.countdown');
  const formatted = formatCountdown(countdownSeconds);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="border-b px-6 py-5 sm:px-8">
          <DialogTitle className="text-lg font-semibold text-foreground">
            {t('title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-6 py-7 sm:px-8">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Clock3 className="size-6" />
            </div>
            <div className="space-y-1.5">
              <p
                aria-label={t('refillsInLabel', { time: formatted })}
                className="font-mono text-5xl font-semibold tracking-tight text-foreground tabular-nums"
              >
                {formatted}
              </p>
              <p className="text-sm font-medium text-muted-foreground">
                {t('refillsIn', { time: formatted })}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3.5">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <DialogDescription className="text-xs leading-5 text-muted-foreground">
              {t('bodyWaiting')}
            </DialogDescription>
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4 sm:px-8 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {t('ctaCancel')}
          </Button>
          <Button
            type="button"
            onClick={onUpgrade ?? (() => onOpenChange(false))}
            className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-700"
          >
            {t('ctaUpgrade')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
