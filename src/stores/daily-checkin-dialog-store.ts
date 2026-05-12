import { create } from 'zustand';

interface DailyCheckinDialogState {
  isOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

export const useDailyCheckinDialogStore = create<DailyCheckinDialogState>(
  (set) => ({
    isOpen: false,
    openDialog: () => set({ isOpen: true }),
    closeDialog: () => set({ isOpen: false }),
  })
);
