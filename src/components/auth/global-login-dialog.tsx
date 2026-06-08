'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLoginDialogStore } from '@/stores/login-dialog-store';
import { LoginModal } from './login-modal';

/**
 * App-wide login dialog driven by {@link useLoginDialogStore}. Rendered
 * once from {@link GlobalDialogs} so any component can open it via
 * `openLoginDialog(reason)` — notably the upload flow, which opens it when
 * the storage endpoint returns 401 for a guest.
 *
 * The login itself refreshes the session via `authClient`, so after the
 * user signs in the originating surface's `useSession` updates and they
 * can retry the action (e.g. re-pick the file).
 */
export function GlobalLoginDialog() {
  const isOpen = useLoginDialogStore((s) => s.isOpen);
  const reason = useLoginDialogStore((s) => s.reason);
  const closeLoginDialog = useLoginDialogStore((s) => s.closeLoginDialog);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeLoginDialog()}>
      <DialogContent className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
        <DialogHeader className="hidden">
          <DialogTitle>Login</DialogTitle>
        </DialogHeader>
        <LoginModal
          reason={reason}
          onSuccess={closeLoginDialog}
          onCancel={closeLoginDialog}
        />
      </DialogContent>
    </Dialog>
  );
}
