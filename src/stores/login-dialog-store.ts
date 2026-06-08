import { create } from 'zustand';
import type { HomeLoginReason } from './home-image-store';

/**
 * App-wide login dialog. Mounted once via {@link GlobalDialogs}, so any
 * surface (home heroes, /app panel, floating bar, dashboard) can prompt
 * the user to sign in without wiring its own modal. Used by the upload
 * flow to turn a 401 into a login prompt instead of an "upload failed"
 * error.
 */
interface LoginDialogState {
  isOpen: boolean;
  reason: HomeLoginReason;
  openLoginDialog: (reason?: HomeLoginReason) => void;
  closeLoginDialog: () => void;
}

export const useLoginDialogStore = create<LoginDialogState>((set) => ({
  isOpen: false,
  reason: 'default',
  openLoginDialog: (reason = 'default') => set({ isOpen: true, reason }),
  closeLoginDialog: () => set({ isOpen: false }),
}));
