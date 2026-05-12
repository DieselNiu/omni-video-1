'use client';

import { LoginModal } from '@/components/auth/login-modal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { HomeLoginReason } from '@/stores/home-image-store';

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callbackUrl?: string;
  reason?: HomeLoginReason;
  onSuccess?: () => void | Promise<void>;
  onCancel?: () => void;
}

export function LoginDialog({
  open,
  onOpenChange,
  callbackUrl,
  reason,
  onSuccess,
  onCancel,
}: LoginDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <LoginDialogContent
        open={open}
        callbackUrl={callbackUrl}
        reason={reason}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    </Dialog>
  );
}

interface LoginDialogContentProps {
  open: boolean;
  callbackUrl?: string;
  reason?: HomeLoginReason;
  onSuccess?: () => void | Promise<void>;
  onCancel?: () => void;
}

export function LoginDialogContent({
  open,
  callbackUrl,
  reason,
  onSuccess,
  onCancel,
}: LoginDialogContentProps) {
  return (
    <DialogContent
      showCloseButton={false}
      className="!max-w-[400px] !gap-0 border-0 bg-transparent !p-0"
    >
      <DialogHeader className="hidden">
        <DialogTitle />
      </DialogHeader>
      {open ? (
        <LoginModal
          callbackUrl={callbackUrl}
          reason={reason}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      ) : null}
    </DialogContent>
  );
}
