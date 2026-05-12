'use client';

import { create } from 'zustand';

export type HomeLoginReason =
  | 'default'
  | 'anon_exhausted'
  | 'feature_gated'
  | 'anon_linked';

export type HomeClaimStatus =
  | 'idle'
  | 'claiming'
  | 'claimed'
  | 'claim-failed'
  | 'withheld';

export type HomePreviewState = 'idle' | 'generating' | 'done' | 'failed';

export type HomeQuotaPolicy = 'ANON_ONE_SHOT' | 'USER_FREE_10MIN';
export type HomeQuotaSubjectType = 'guest' | 'user';
export type HomeQuotaAccessMode =
  | 'guest_quota'
  | 'free_quota'
  | 'credits'
  | 'purchase_required'
  | 'login_required';

export interface HomeQuotaState {
  subjectType: HomeQuotaSubjectType;
  accessMode: HomeQuotaAccessMode;
  remaining: number;
  capacity: number;
  policy: HomeQuotaPolicy;
  nextRefillAt: string | null;
  errorCode: string | null;
  exhausted: boolean;
  degraded: boolean;
  serverNow: string;
  currentCredits: number;
  hasSuccessfulCreditPurchase: boolean;
  fetchedAt: number;
}

export interface HomeRecentGeneration {
  id: string;
  providerRequestId: string | null;
  status: string;
  prompt: string | null;
  modelId: string | null;
  outputImageUrls: string[];
  outputImageUrlsR2: string[];
  thumbnailUrl: string | null;
  createdAt: string | null;
  completedAt: string | null;
}

export interface HomeInFlightJob {
  jobId: string;
  startedAt: number;
  modelId: string;
  prompt?: string;
  aspectRatio?: string;
  resolution?: string;
}

interface HomeImageState {
  quota: HomeQuotaState | null;
  recentGenerations: HomeRecentGeneration[];
  claimStatus: HomeClaimStatus;
  previewState: HomePreviewState;
  progress: number;
  resultImageUrl: string | null;
  errorMessage: string | null;
  inFlightJob: HomeInFlightJob | null;
  selectedRecentId: string | null;
  loginModalReason: HomeLoginReason;
  isLoginModalOpen: boolean;
  isCountdownOpen: boolean;
  isQuotaLoading: boolean;
  isRecentLoading: boolean;
  isSubmitting: boolean;
  setQuota: (quota: HomeQuotaState | null) => void;
  setRecentGenerations: (items: HomeRecentGeneration[]) => void;
  setClaimStatus: (status: HomeClaimStatus) => void;
  setPreviewState: (state: HomePreviewState) => void;
  setProgress: (progress: number) => void;
  setResultImageUrl: (url: string | null) => void;
  setErrorMessage: (message: string | null) => void;
  setInFlightJob: (job: HomeInFlightJob | null) => void;
  setSelectedRecentId: (id: string | null) => void;
  openLoginModal: (reason: HomeLoginReason) => void;
  closeLoginModal: () => void;
  setCountdownOpen: (open: boolean) => void;
  setQuotaLoading: (loading: boolean) => void;
  setRecentLoading: (loading: boolean) => void;
  setSubmitting: (submitting: boolean) => void;
  resetPreview: () => void;
}

export const useHomeImageStore = create<HomeImageState>((set) => ({
  quota: null,
  recentGenerations: [],
  claimStatus: 'idle',
  previewState: 'idle',
  progress: 0,
  resultImageUrl: null,
  errorMessage: null,
  inFlightJob: null,
  selectedRecentId: null,
  loginModalReason: 'default',
  isLoginModalOpen: false,
  isCountdownOpen: false,
  isQuotaLoading: true,
  isRecentLoading: true,
  isSubmitting: false,

  setQuota: (quota) => set({ quota }),
  setRecentGenerations: (recentGenerations) => set({ recentGenerations }),
  setClaimStatus: (claimStatus) => set({ claimStatus }),
  setPreviewState: (previewState) => set({ previewState }),
  setProgress: (progress) => set({ progress }),
  setResultImageUrl: (resultImageUrl) => set({ resultImageUrl }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setInFlightJob: (inFlightJob) => set({ inFlightJob }),
  setSelectedRecentId: (selectedRecentId) => set({ selectedRecentId }),
  openLoginModal: (loginModalReason) =>
    set({ isLoginModalOpen: true, loginModalReason }),
  closeLoginModal: () => set({ isLoginModalOpen: false }),
  setCountdownOpen: (isCountdownOpen) => set({ isCountdownOpen }),
  setQuotaLoading: (isQuotaLoading) => set({ isQuotaLoading }),
  setRecentLoading: (isRecentLoading) => set({ isRecentLoading }),
  setSubmitting: (isSubmitting) => set({ isSubmitting }),
  resetPreview: () =>
    set({
      previewState: 'idle',
      progress: 0,
      errorMessage: null,
      resultImageUrl: null,
      selectedRecentId: null,
    }),
}));
