import { create } from 'zustand';

interface InsufficientCreditsDialogState {
  isOpen: boolean;
  currentCredits: number;
  requiredCredits: number;

  openDialog: (params: {
    currentCredits: number;
    requiredCredits: number;
  }) => void;
  closeDialog: () => void;
}

export const useInsufficientCreditsDialogStore =
  create<InsufficientCreditsDialogState>((set) => ({
    isOpen: false,
    currentCredits: 0,
    requiredCredits: 0,

    openDialog: ({ currentCredits, requiredCredits }) =>
      set({
        isOpen: true,
        currentCredits,
        requiredCredits,
      }),

    closeDialog: () =>
      set({
        isOpen: false,
        currentCredits: 0,
        requiredCredits: 0,
      }),
  }));
