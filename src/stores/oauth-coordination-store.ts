import { create } from 'zustand';

interface OAuthCoordinationState {
  isPopupOAuthActive: boolean;
  setPopupOAuthActive: (active: boolean) => void;
}

export const useOAuthCoordinationStore = create<OAuthCoordinationState>(
  (set) => ({
    isPopupOAuthActive: false,
    setPopupOAuthActive: (active) => set({ isPopupOAuthActive: active }),
  })
);
