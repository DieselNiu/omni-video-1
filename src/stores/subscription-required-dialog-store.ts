import { create } from 'zustand';

interface SubscriptionRequiredDialogState {
  isOpen: boolean;
  feature: string;
  openDialog: (feature: string) => void;
  closeDialog: () => void;
}

export const useSubscriptionRequiredDialogStore =
  create<SubscriptionRequiredDialogState>((set) => ({
    isOpen: false,
    feature: '',
    openDialog: (feature: string) => set({ isOpen: true, feature }),
    closeDialog: () => set({ isOpen: false, feature: '' }),
  }));
