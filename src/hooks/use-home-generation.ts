'use client';

import type { UpgradeDialogTrigger } from '@/components/pricing/upgrade-dialog';
import { websiteConfig } from '@/config/website';
import { authClient } from '@/lib/auth-client';
import {
  type HomeInFlightJob,
  type HomeLoginReason,
  type HomeQuotaState,
  type HomeRecentGeneration,
  useHomeImageStore,
} from '@/stores/home-image-store';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CaptchaDismissedError,
  useCaptchaChallenge,
} from './use-captcha-challenge';
import { useElapsedTime } from './use-elapsed-time';
import { useFingerprint } from './use-fingerprint';
import { useSimulatedProgress } from './use-simulated-progress';
import { useToast } from './use-toast';

const MAX_CAPTCHA_ATTEMPTS = 3;

// `HOME_PUBLIC_MODEL_ID` is the model the homepage shows to users —
// pulled from the home-anonymous surface so swapping the homepage
// model is a one-line config change in `website.tsx`.
//
// `HOME_INTERNAL_MODEL_ID` is the legacy id some historical rows still
// carry on the wire; we translate it back to the public id so the UI
// label stays consistent regardless of when the row was written.
const HOME_PUBLIC_MODEL_ID =
  websiteConfig.generation.surfaces['home-anonymous'].defaultModel;
const HOME_INTERNAL_MODEL_ID = 'nano-banana-pro';
const IS_CLASSIC_CREDITS_MODE = websiteConfig.credits.mode === 'classic';

function toWireModelId(modelId: string): string {
  return modelId === HOME_INTERNAL_MODEL_ID ? HOME_PUBLIC_MODEL_ID : modelId;
}

function fromWireModelId<T extends string | null | undefined>(modelId: T): T {
  return (
    modelId === HOME_PUBLIC_MODEL_ID ? HOME_INTERNAL_MODEL_ID : modelId
  ) as T;
}

const HOME_PENDING_KEY = 'home:pendingGeneration';
const HOME_LAST_JOB_KEY = 'home:lastJobId';
const HOME_LAST_GATE_REASON_KEY = 'home:lastGateReason';
const POLL_INTERVAL_MS = 2500;
const PENDING_TTL_MS = 10 * 60 * 1000;
const QUIET_QUOTA_REFETCH_WINDOW_MS = 10 * 1000;

export interface HomeGenerationParams {
  modelId: string;
  prompt: string;
  mode: 'text-to-image' | 'image-to-image';
  imageUrls?: string[];
  aspectRatio: string;
  resolution?: string;
}

interface PendingGenerationStorage extends HomeGenerationParams {
  createdAt: number;
}

interface HomeQuotaResponse {
  subjectType: 'guest' | 'user';
  accessMode:
    | 'guest_quota'
    | 'free_quota'
    | 'credits'
    | 'purchase_required'
    | 'login_required';
  remaining: number;
  capacity: number;
  policy: 'ANON_ONE_SHOT' | 'USER_FREE_10MIN';
  nextRefillAt?: string | null;
  errorCode?: string | null;
  exhausted?: boolean;
  degraded?: boolean;
  serverNow: string;
  currentCredits?: number;
  hasSuccessfulCreditPurchase?: boolean;
}

interface HomeClaimResponse {
  claimedCount?: number;
  withheld?: boolean;
}

interface HomeSubmitResponse {
  jobId?: string;
  taskId?: string;
  providerRequestId?: string;
}

interface HomeStatusResponse {
  id?: string;
  status: string;
  outputImageUrls?: string[];
  outputImageUrlsR2?: string[];
  imageUrls?: string[];
  imageUrlsR2?: string[];
  thumbnailUrl?: string;
  errorMessage?: string | null;
}

function isBrowser() {
  return typeof window !== 'undefined';
}

function getSessionStorageItem(key: string): string | null {
  if (!isBrowser()) return null;
  return window.sessionStorage.getItem(key);
}

function setSessionStorageItem(key: string, value: string) {
  if (!isBrowser()) return;
  window.sessionStorage.setItem(key, value);
}

function removeSessionStorageItem(key: string) {
  if (!isBrowser()) return;
  window.sessionStorage.removeItem(key);
}

function readPendingGeneration(): PendingGenerationStorage | null {
  const value = getSessionStorageItem(HOME_PENDING_KEY);
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as PendingGenerationStorage;
    if (!parsed.createdAt || Date.now() - parsed.createdAt > PENDING_TTL_MS) {
      removeSessionStorageItem(HOME_PENDING_KEY);
      return null;
    }
    return parsed;
  } catch {
    removeSessionStorageItem(HOME_PENDING_KEY);
    return null;
  }
}

function writePendingGeneration(params: HomeGenerationParams) {
  setSessionStorageItem(
    HOME_PENDING_KEY,
    JSON.stringify({
      ...params,
      createdAt: Date.now(),
    } satisfies PendingGenerationStorage)
  );
}

function clearPendingGeneration() {
  removeSessionStorageItem(HOME_PENDING_KEY);
}

function readLastJobId(): string | null {
  return getSessionStorageItem(HOME_LAST_JOB_KEY);
}

function writeLastJobId(jobId: string) {
  setSessionStorageItem(HOME_LAST_JOB_KEY, jobId);
}

function clearLastJobId() {
  removeSessionStorageItem(HOME_LAST_JOB_KEY);
}

function readLastGateReason(): HomeLoginReason | null {
  const value = getSessionStorageItem(HOME_LAST_GATE_REASON_KEY);
  if (
    value === 'anon_exhausted' ||
    value === 'feature_gated' ||
    value === 'anon_linked' ||
    value === 'default'
  ) {
    return value;
  }
  return null;
}

function writeLastGateReason(reason: HomeLoginReason) {
  setSessionStorageItem(HOME_LAST_GATE_REASON_KEY, reason);
}

function clearLastGateReason() {
  removeSessionStorageItem(HOME_LAST_GATE_REASON_KEY);
}

function normalizeQuota(raw: unknown): HomeQuotaState | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<HomeQuotaResponse>;
  if (!data.subjectType || !data.policy || !data.serverNow || !data.accessMode)
    return null;

  const remaining = Number(data.remaining ?? 0);
  const capacity = Number(data.capacity ?? 5);

  return {
    subjectType: data.subjectType,
    accessMode: data.accessMode,
    remaining,
    capacity,
    policy: data.policy,
    nextRefillAt: data.nextRefillAt ?? null,
    errorCode: data.errorCode ?? null,
    exhausted: data.exhausted ?? remaining <= 0,
    degraded: data.degraded ?? false,
    serverNow: data.serverNow,
    currentCredits: Number(data.currentCredits ?? 0),
    hasSuccessfulCreditPurchase: data.hasSuccessfulCreditPurchase ?? false,
    fetchedAt: Date.now(),
  };
}

function createClassicQuotaSnapshot(isLoggedIn: boolean): HomeQuotaState {
  return {
    subjectType: isLoggedIn ? 'user' : 'guest',
    accessMode: isLoggedIn ? 'credits' : 'login_required',
    remaining: 0,
    capacity: 0,
    policy: isLoggedIn ? 'USER_FREE_10MIN' : 'ANON_ONE_SHOT',
    nextRefillAt: null,
    errorCode: null,
    exhausted: !isLoggedIn,
    degraded: false,
    serverNow: new Date().toISOString(),
    currentCredits: 0,
    hasSuccessfulCreditPurchase: false,
    fetchedAt: Date.now(),
  };
}

function normalizeRecentRecord(raw: unknown): HomeRecentGeneration | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  const outputImageUrls = Array.isArray(data.outputImageUrls)
    ? data.outputImageUrls
    : Array.isArray(data.output_image_urls)
      ? data.output_image_urls
      : Array.isArray(data.imageUrls)
        ? data.imageUrls
        : Array.isArray(data.image_urls)
          ? data.image_urls
          : [];
  const outputImageUrlsR2 = Array.isArray(data.outputImageUrlsR2)
    ? data.outputImageUrlsR2
    : Array.isArray(data.output_image_urls_r2)
      ? data.output_image_urls_r2
      : Array.isArray(data.imageUrlsR2)
        ? data.imageUrlsR2
        : Array.isArray(data.image_urls_r2)
          ? data.image_urls_r2
          : [];

  const normalizedOutputUrls = outputImageUrls.filter(
    (item): item is string => typeof item === 'string'
  );
  const normalizedOutputUrlsR2 = outputImageUrlsR2.filter(
    (item): item is string => typeof item === 'string'
  );

  return {
    id:
      (typeof data.id === 'string' && data.id) ||
      (typeof data.providerRequestId === 'string' && data.providerRequestId) ||
      (typeof data.provider_request_id === 'string' &&
        data.provider_request_id) ||
      crypto.randomUUID(),
    providerRequestId:
      (typeof data.providerRequestId === 'string' && data.providerRequestId) ||
      (typeof data.provider_request_id === 'string' &&
        data.provider_request_id) ||
      null,
    status: (typeof data.status === 'string' && data.status) || 'PENDING',
    prompt: typeof data.prompt === 'string' ? data.prompt : null,
    modelId: fromWireModelId(
      (typeof data.modelId === 'string' && data.modelId) ||
        (typeof data.model_id === 'string' && data.model_id) ||
        null
    ),
    outputImageUrls: normalizedOutputUrls,
    outputImageUrlsR2: normalizedOutputUrlsR2,
    thumbnailUrl:
      (typeof data.thumbnailUrl === 'string' && data.thumbnailUrl) ||
      (typeof data.thumbnail_url === 'string' && data.thumbnail_url) ||
      null,
    createdAt:
      (typeof data.createdAt === 'string' && data.createdAt) ||
      (typeof data.created_at === 'string' && data.created_at) ||
      null,
    completedAt:
      (typeof data.completedAt === 'string' && data.completedAt) ||
      (typeof data.completed_at === 'string' && data.completed_at) ||
      null,
  };
}

function extractRecentItems(raw: unknown): HomeRecentGeneration[] {
  if (Array.isArray(raw)) {
    return raw
      .map(normalizeRecentRecord)
      .filter(Boolean) as HomeRecentGeneration[];
  }

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;
    if (Array.isArray(data.data)) {
      return data.data
        .map(normalizeRecentRecord)
        .filter(Boolean) as HomeRecentGeneration[];
    }
    if (Array.isArray(data.items)) {
      return data.items
        .map(normalizeRecentRecord)
        .filter(Boolean) as HomeRecentGeneration[];
    }
  }

  return [];
}

function extractJobId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as HomeSubmitResponse;
  return data.jobId || data.taskId || data.providerRequestId || null;
}

function extractStatusValue(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'PENDING';
  const data = payload as HomeStatusResponse & { state?: string };
  return data.status || data.state || 'PENDING';
}

function extractImageUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as HomeStatusResponse;
  return (
    data.outputImageUrls?.[0] ||
    data.imageUrlsR2?.[0] ||
    data.imageUrls?.[0] ||
    data.thumbnailUrl ||
    null
  );
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as HomeStatusResponse & { error?: string | null };
  return data.errorMessage || data.error || null;
}

function isSuccessfulStatus(status: string) {
  const normalized = status.toUpperCase();
  return (
    normalized === 'COMPLETED' ||
    normalized === 'SAVED_TO_R2' ||
    normalized === 'SUCCEEDED' ||
    normalized === 'SUCCESS'
  );
}

function isFailedStatus(status: string) {
  const normalized = status.toUpperCase();
  return (
    normalized === 'FAILED' ||
    normalized === 'ERROR' ||
    normalized === 'CANCELLED' ||
    normalized.endsWith('_FAILED')
  );
}

function getRemainingSeconds(quota: HomeQuotaState | null) {
  if (!quota?.nextRefillAt || !quota.exhausted) return 0;

  const serverNowMs = new Date(quota.serverNow).getTime();
  const nextRefillMs = new Date(quota.nextRefillAt).getTime();
  const elapsedSinceFetch = Date.now() - quota.fetchedAt;

  return Math.max(
    0,
    Math.ceil((nextRefillMs - serverNowMs - elapsedSinceFetch) / 1000)
  );
}

async function parseJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function createSubjectQuotaSnapshot(
  quota: HomeQuotaState | null,
  overrides: Partial<HomeQuotaState>
): HomeQuotaState | null {
  if (!quota) return null;
  return {
    ...quota,
    ...overrides,
    fetchedAt: Date.now(),
  };
}

export function useHomeGeneration() {
  const tErrors = useTranslations('HomeQuota.errors');
  const tWithheld = useTranslations('HomeQuota.withheld');
  const { data: session } = authClient.useSession();
  const { toast } = useToast();

  const {
    quota,
    recentGenerations,
    claimStatus,
    previewState,
    progress,
    resultImageUrl,
    errorMessage,
    inFlightJob,
    selectedRecentId,
    loginModalReason,
    isLoginModalOpen,
    isCountdownOpen,
    isQuotaLoading,
    isRecentLoading,
    isSubmitting,
    setQuota,
    setRecentGenerations,
    setClaimStatus,
    setPreviewState,
    setProgress,
    setResultImageUrl,
    setErrorMessage,
    setInFlightJob,
    setSelectedRecentId,
    openLoginModal,
    closeLoginModal,
    setCountdownOpen,
    setQuotaLoading,
    setRecentLoading,
    setSubmitting,
    resetPreview,
  } = useHomeImageStore();

  const { presentChallenge, captchaDialog } = useCaptchaChallenge();
  const { fingerprint } = useFingerprint();

  const pollTimerRef = useRef<number | null>(null);
  const submitAbortControllerRef = useRef<AbortController | null>(null);
  const submitAttemptRef = useRef(0);
  const claimAttemptedForUserRef = useRef<string | null>(null);
  const isClaimingRef = useRef(false);
  const quotaRef = useRef<HomeQuotaState | null>(quota);
  const inFlightJobRef = useRef<HomeInFlightJob | null>(inFlightJob);
  const countdownOpenRef = useRef(isCountdownOpen);
  const quotaRequestRef = useRef<Promise<HomeQuotaState | null> | null>(null);
  const lastQuotaFetchAtRef = useRef(0);
  const cooldownRefreshKeyRef = useRef<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = useState(false);
  const [upgradeDialogTrigger, setUpgradeDialogTrigger] =
    useState<UpgradeDialogTrigger>('manual');
  const elapsedTime = useElapsedTime(
    previewState === 'generating' && inFlightJob
      ? inFlightJob.startedAt
      : undefined,
    previewState === 'generating' && !!inFlightJob
  );
  const simulatedProgress = useSimulatedProgress(elapsedTime, undefined, false);

  const clearProgressTimer = useCallback(() => {}, []);

  useEffect(() => {
    quotaRef.current = quota;
  }, [quota]);

  useEffect(() => {
    inFlightJobRef.current = inFlightJob;
  }, [inFlightJob]);

  useEffect(() => {
    countdownOpenRef.current = isCountdownOpen;
  }, [isCountdownOpen]);

  useEffect(() => {
    if (!isCountdownOpen || !quota?.exhausted || !quota?.nextRefillAt) {
      cooldownRefreshKeyRef.current = null;
    }
  }, [isCountdownOpen, quota?.exhausted, quota?.nextRefillAt]);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const refetchQuota = useCallback(
    async ({
      silent = false,
      force = false,
    }: { silent?: boolean; force?: boolean } = {}) => {
      const now = Date.now();
      if (
        silent &&
        !force &&
        quotaRef.current &&
        !countdownOpenRef.current &&
        !inFlightJobRef.current &&
        now - lastQuotaFetchAtRef.current < QUIET_QUOTA_REFETCH_WINDOW_MS
      ) {
        return quotaRef.current;
      }

      if (IS_CLASSIC_CREDITS_MODE) {
        const localQuota = createClassicQuotaSnapshot(!!session?.user?.id);
        setQuota(localQuota);
        setQuotaLoading(false);
        lastQuotaFetchAtRef.current = Date.now();
        return localQuota;
      }

      if (quotaRequestRef.current) {
        return quotaRequestRef.current;
      }

      if (!silent) {
        setQuotaLoading(true);
      }

      const request = (async () => {
        try {
          const response = await fetch('/api/home/image/quota/', {
            cache: 'no-store',
            credentials: 'include',
            headers: fingerprint ? { 'x-visitor-id': fingerprint } : undefined,
          });
          const payload = await parseJson(response);

          if (!response.ok) {
            throw new Error(
              (payload as { error?: string } | null)?.error ||
                'Failed to fetch quota'
            );
          }

          const normalized = normalizeQuota(payload);
          setQuota(normalized);
          lastQuotaFetchAtRef.current = Date.now();
          return normalized;
        } catch {
          if (quotaRef.current) {
            setQuota({
              ...quotaRef.current,
              degraded: true,
              fetchedAt: Date.now(),
            });
          }
          return null;
        } finally {
          quotaRequestRef.current = null;
          if (!silent) {
            setQuotaLoading(false);
          }
        }
      })();

      quotaRequestRef.current = request;
      return request;
    },
    [fingerprint, session?.user?.id, setQuota, setQuotaLoading]
  );

  const refetchRecent = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setRecentLoading(true);
      }

      try {
        const response = await fetch('/api/home/image/recent/', {
          cache: 'no-store',
          credentials: 'include',
        });
        const payload = await parseJson(response);

        if (!response.ok) {
          throw new Error(
            (payload as { error?: string } | null)?.error ||
              'Failed to fetch recent generations'
          );
        }

        setRecentGenerations(extractRecentItems(payload));
      } catch {
        // Keep the last successful recent list on screen.
      } finally {
        if (!silent) {
          setRecentLoading(false);
        }
      }
    },
    [setRecentGenerations, setRecentLoading]
  );

  const finalizeSuccessfulJob = useCallback(
    async (payload: unknown) => {
      clearPollTimer();
      clearProgressTimer();
      clearLastJobId();

      setInFlightJob(null);
      setPreviewState('done');
      setProgress(100);
      setErrorMessage(null);

      const imageUrl = extractImageUrl(payload);
      if (imageUrl) {
        setResultImageUrl(imageUrl);
      }

      const completedId =
        normalizeRecentRecord(payload)?.id ||
        (typeof (payload as { id?: unknown })?.id === 'string'
          ? (payload as { id: string }).id
          : null);
      setSelectedRecentId(completedId);

      await Promise.all([
        refetchRecent({ silent: true }),
        refetchQuota({ silent: true }),
      ]);
    },
    [
      clearPollTimer,
      clearProgressTimer,
      refetchQuota,
      refetchRecent,
      setErrorMessage,
      setInFlightJob,
      setPreviewState,
      setProgress,
      setResultImageUrl,
      setSelectedRecentId,
    ]
  );

  const finalizeFailedJob = useCallback(
    async (payload: unknown) => {
      clearPollTimer();
      clearProgressTimer();
      clearLastJobId();

      setInFlightJob(null);
      setPreviewState('failed');
      setProgress(0);
      setErrorMessage(extractErrorMessage(payload) || 'Generation failed');

      await Promise.all([
        refetchRecent({ silent: true }),
        refetchQuota({ silent: true }),
      ]);
    },
    [
      clearPollTimer,
      clearProgressTimer,
      refetchQuota,
      refetchRecent,
      setErrorMessage,
      setInFlightJob,
      setPreviewState,
      setProgress,
    ]
  );

  const pollJobStatus = useCallback(async (jobId: string) => {
    const response = await fetch(
      `/api/home/image/status/?jobId=${encodeURIComponent(jobId)}`,
      {
        cache: 'no-store',
        credentials: 'include',
      }
    );
    const payload = await parseJson(response);

    if (!response.ok) {
      throw new Error(
        (payload as { error?: string } | null)?.error ||
          'Failed to check status'
      );
    }

    return payload;
  }, []);

  const beginProgressSimulation = useCallback(() => {
    setPreviewState('generating');
    setErrorMessage(null);
  }, [setErrorMessage, setPreviewState]);

  const openUpgradeDialog = useCallback(
    (trigger: UpgradeDialogTrigger = 'manual') => {
      setUpgradeDialogTrigger(trigger);
      setCountdownOpen(false);
      closeLoginModal();
      setIsUpgradeDialogOpen(true);
    },
    [closeLoginModal, setCountdownOpen]
  );

  const openUpgradeDialogPreservingPending = useCallback(
    (trigger: UpgradeDialogTrigger = 'manual') => {
      setUpgradeDialogTrigger(trigger);
      closeLoginModal();
      setIsUpgradeDialogOpen(true);
    },
    [closeLoginModal]
  );

  const trackInFlightJob = useCallback(
    (
      jobId: string,
      params?: Partial<HomeGenerationParams>,
      startedAtOverride?: number
    ) => {
      clearPollTimer();
      writeLastJobId(jobId);
      beginProgressSimulation();
      setResultImageUrl(null);
      setSelectedRecentId(null);
      setInFlightJob({
        jobId,
        startedAt: startedAtOverride ?? Date.now(),
        modelId: params?.modelId || 'nano-banana-pro',
        prompt: params?.prompt,
        aspectRatio: params?.aspectRatio,
        resolution: params?.resolution,
      } satisfies HomeInFlightJob);

      pollTimerRef.current = window.setInterval(async () => {
        try {
          const payload = await pollJobStatus(jobId);
          const status = extractStatusValue(payload);

          if (isSuccessfulStatus(status)) {
            await finalizeSuccessfulJob(payload);
            return;
          }

          if (isFailedStatus(status)) {
            await finalizeFailedJob(payload);
          }
        } catch {
          // Keep polling until the backend reports a definitive state.
        }
      }, POLL_INTERVAL_MS);
    },
    [
      beginProgressSimulation,
      clearPollTimer,
      finalizeFailedJob,
      finalizeSuccessfulJob,
      pollJobStatus,
      setInFlightJob,
      setResultImageUrl,
      setSelectedRecentId,
    ]
  );

  const submitGeneration = useCallback(
    async (
      params: HomeGenerationParams,
      options: { skipPreflightBlock?: boolean } = {}
    ) => {
      const attemptId = ++submitAttemptRef.current;
      const startedAt = Date.now();
      const abortController = new AbortController();

      submitAbortControllerRef.current = abortController;
      setSubmitting(true);
      beginProgressSimulation();
      setResultImageUrl(null);
      setSelectedRecentId(null);
      setInFlightJob({
        jobId: '',
        startedAt,
        modelId: params.modelId,
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
      });

      // Captcha gate retry loop: when the server returns 428
      // (captcha_required / captcha_invalid), we present Turnstile,
      // collect a fresh token, and retry with it in the body. The
      // server gives us a new idempotency key each time so a replayed
      // key with a different payload cannot collide.
      let captchaToken: string | null = null;
      let captchaAttempts = 0;

      try {
        // Retry loop exits via return/break/throw after captcha handling.
        while (true) {
          const response = await fetch('/api/home/image/submit/', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': crypto.randomUUID(),
              ...(fingerprint ? { 'x-visitor-id': fingerprint } : {}),
            },
            signal: abortController.signal,
            body: JSON.stringify({
              ...params,
              modelId: toWireModelId(params.modelId),
              ...(captchaToken ? { captchaToken } : {}),
              ...(fingerprint ? { visitorId: fingerprint } : {}),
            }),
          });
          const payload = await parseJson(response);

          if (attemptId !== submitAttemptRef.current) {
            return false;
          }

          if (response.status === 428) {
            const captchaPayload = payload as {
              error?: string;
              siteKey?: string | null;
            } | null;
            const errorCode = captchaPayload?.error;
            if (
              errorCode === 'captcha_required' ||
              errorCode === 'captcha_invalid'
            ) {
              if (captchaAttempts >= MAX_CAPTCHA_ATTEMPTS) {
                resetPreview();
                setInFlightJob(null);
                toast({
                  title: tErrors('captchaFailed'),
                  variant: 'destructive',
                });
                return false;
              }
              captchaAttempts += 1;
              try {
                captchaToken = await presentChallenge({
                  tokenInvalid: errorCode === 'captcha_invalid',
                  siteKey: captchaPayload?.siteKey ?? null,
                });
                continue;
              } catch (challengeError) {
                if (challengeError instanceof CaptchaDismissedError) {
                  resetPreview();
                  setInFlightJob(null);
                  return false;
                }
                throw challengeError;
              }
            }
          }

          if (!response.ok) {
            const errorCode = (payload as { error?: string } | null)?.error;

            if (
              errorCode === 'ANON_QUOTA_EXHAUSTED' ||
              errorCode === 'ANON_BUCKET_LINKED_LOGIN_REQUIRED' ||
              errorCode === 'FEATURE_REQUIRES_LOGIN'
            ) {
              writePendingGeneration(params);
              const reason: HomeLoginReason =
                errorCode === 'ANON_BUCKET_LINKED_LOGIN_REQUIRED'
                  ? 'anon_linked'
                  : errorCode === 'FEATURE_REQUIRES_LOGIN'
                    ? 'feature_gated'
                    : 'anon_exhausted';
              writeLastGateReason(reason);
              resetPreview();
              setInFlightJob(null);
              openLoginModal(reason);
              return false;
            }

            if (errorCode === 'USER_QUOTA_EXHAUSTED') {
              resetPreview();
              setInFlightJob(null);
              const nextRefillAt =
                (payload as { nextRefillAt?: string | null }).nextRefillAt ??
                quota?.nextRefillAt ??
                null;
              const serverNow =
                (payload as { serverNow?: string }).serverNow ||
                quota?.serverNow ||
                new Date().toISOString();

              const nextQuota =
                createSubjectQuotaSnapshot(quota, {
                  exhausted: true,
                  nextRefillAt,
                  serverNow,
                  remaining: 0,
                }) ??
                normalizeQuota({
                  subjectType: 'user',
                  accessMode: 'free_quota',
                  remaining: 0,
                  capacity: quota?.capacity ?? 5,
                  policy: 'USER_FREE_10MIN',
                  nextRefillAt,
                  errorCode: 'USER_QUOTA_EXHAUSTED',
                  exhausted: true,
                  degraded: quota?.degraded ?? false,
                  serverNow,
                  currentCredits: 0,
                  hasSuccessfulCreditPurchase:
                    quota?.hasSuccessfulCreditPurchase ?? false,
                });
              setQuota(nextQuota);
              if (nextQuota) {
                setCountdownSeconds(getRemainingSeconds(nextQuota));
              }
              setCountdownOpen(true);
              return false;
            }

            if (errorCode === 'PAID_USER_NO_CREDITS') {
              resetPreview();
              setInFlightJob(null);
              openUpgradeDialog('credits_depleted');
              return false;
            }

            if (errorCode === 'NSFW_BLOCKED') {
              resetPreview();
              setInFlightJob(null);
              openUpgradeDialog('nsfw_block');
              return false;
            }

            if (errorCode === 'RATE_LIMITED') {
              resetPreview();
              setInFlightJob(null);
              toast({
                title: tErrors('rateLimited'),
                variant: 'destructive',
              });
              return false;
            }

            if (errorCode === 'CONCURRENT_LIMIT') {
              const existingJobId =
                (payload as { jobId?: string | null } | null)?.jobId ?? null;

              if (existingJobId) {
                trackInFlightJob(existingJobId, params, startedAt);
                toast({
                  title: tErrors('requestInProgress'),
                });
                return false;
              }

              resetPreview();
              setInFlightJob(null);
              toast({
                title: tErrors('concurrentLimit'),
                variant: 'destructive',
              });
              return false;
            }

            if (errorCode === 'REQUEST_IN_PROGRESS') {
              resetPreview();
              setInFlightJob(null);
              toast({
                title: tErrors('requestInProgress'),
              });
              return false;
            }

            if (errorCode === 'GUEST_COOKIE_MISSING') {
              resetPreview();
              setInFlightJob(null);
              toast({
                title: tErrors('guestCookieMissing'),
              });
              if (isBrowser()) {
                window.setTimeout(() => window.location.reload(), 600);
              }
              return false;
            }

            if (errorCode === 'INVALID_PARAMS') {
              resetPreview();
              setInFlightJob(null);
              toast({
                title: tErrors('invalidParams'),
                variant: 'destructive',
              });
              return false;
            }

            // Surface allow-list rejection — happens if a stale UI sends
            // a model id that the home-anonymous surface no longer
            // accepts (e.g. after config narrowing). User-actionable
            // hint: refresh the page to pick up the current allowed list.
            if (errorCode === 'MODEL_NOT_AVAILABLE_ON_SURFACE') {
              resetPreview();
              setInFlightJob(null);
              toast({
                title: tErrors('invalidParams'),
                description:
                  'This model is no longer available here. Please refresh the page.',
                variant: 'destructive',
              });
              return false;
            }

            throw new Error(errorCode || 'Failed to submit generation');
          }

          const jobId = extractJobId(payload);
          if (!jobId) {
            throw new Error('Submit succeeded without a job id');
          }

          clearPendingGeneration();
          clearLastGateReason();
          setCountdownOpen(false);

          trackInFlightJob(jobId, params, startedAt);
          await Promise.all([
            refetchQuota({ silent: true }),
            refetchRecent({ silent: true }),
          ]);

          return true;
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return false;
        }

        if (!options.skipPreflightBlock) {
          setPreviewState('failed');
          setErrorMessage(
            error instanceof Error ? error.message : 'Generation failed'
          );
        }
        return false;
      } finally {
        if (submitAbortControllerRef.current === abortController) {
          submitAbortControllerRef.current = null;
        }
        setSubmitting(false);
      }
    },
    [
      beginProgressSimulation,
      closeLoginModal,
      fingerprint,
      openLoginModal,
      openUpgradeDialog,
      presentChallenge,
      quota,
      refetchQuota,
      refetchRecent,
      resetPreview,
      setCountdownOpen,
      setErrorMessage,
      setInFlightJob,
      setPreviewState,
      setProgress,
      setQuota,
      setResultImageUrl,
      setSelectedRecentId,
      setSubmitting,
      tErrors,
      toast,
      trackInFlightJob,
    ]
  );

  const attemptClaim = useCallback(
    async ({ resumePending = false }: { resumePending?: boolean } = {}) => {
      if (IS_CLASSIC_CREDITS_MODE) {
        setClaimStatus('idle');
        if (resumePending && session?.user) {
          const pendingGeneration = readPendingGeneration();
          if (pendingGeneration) {
            await submitGeneration(pendingGeneration, {
              skipPreflightBlock: true,
            });
          }
        }
        return true;
      }

      if (!session?.user || isClaimingRef.current) {
        return false;
      }

      isClaimingRef.current = true;
      setClaimStatus('claiming');

      try {
        const response = await fetch('/api/home/image/claim-guest/', {
          method: 'POST',
          credentials: 'include',
        });
        const payload = (await parseJson(response)) as HomeClaimResponse | null;

        if (!response.ok) {
          throw new Error(
            (payload as { error?: string } | null)?.error || 'Claim failed'
          );
        }

        if (payload?.withheld) {
          clearPendingGeneration();
          clearLastGateReason();
          setClaimStatus('withheld');
          toast({
            title: tWithheld('bannerTitle'),
            description: tWithheld('bannerBody'),
            variant: 'destructive',
          });
          await Promise.all([
            refetchQuota({ silent: true }),
            refetchRecent({ silent: true }),
          ]);
          return false;
        }

        setClaimStatus('claimed');
        await Promise.all([
          refetchQuota({ silent: true }),
          refetchRecent({ silent: true }),
        ]);

        if (resumePending) {
          const pendingGeneration = readPendingGeneration();
          if (pendingGeneration) {
            await submitGeneration(pendingGeneration, {
              skipPreflightBlock: true,
            });
          }
        }

        return true;
      } catch {
        setClaimStatus('claim-failed');
        toast({
          title: tErrors('claimFailed'),
          variant: 'destructive',
        });
        return false;
      } finally {
        isClaimingRef.current = false;
      }
    },
    [
      refetchQuota,
      refetchRecent,
      session?.user,
      setClaimStatus,
      submitGeneration,
      tErrors,
      tWithheld,
      toast,
    ]
  );

  const handleGenerate = useCallback(
    async (params: HomeGenerationParams) => {
      if (claimStatus === 'claiming' || isSubmitting) {
        return;
      }

      if (IS_CLASSIC_CREDITS_MODE && !session?.user) {
        writePendingGeneration(params);
        writeLastGateReason('feature_gated');
        openLoginModal('feature_gated');
        return;
      }

      if (!session?.user && quota?.accessMode === 'login_required') {
        writePendingGeneration(params);
        writeLastGateReason('feature_gated');
        openLoginModal('feature_gated');
        return;
      }

      if (session?.user && quota?.accessMode === 'purchase_required') {
        openUpgradeDialog('purchase_required');
        return;
      }

      if (
        session?.user &&
        quota?.accessMode === 'free_quota' &&
        quota.exhausted
      ) {
        const refreshedQuota = await refetchQuota({ silent: true });

        if (refreshedQuota && !refreshedQuota.exhausted) {
          setCountdownOpen(false);
          await submitGeneration(params);
          return;
        }

        if (refreshedQuota) {
          setCountdownSeconds(getRemainingSeconds(refreshedQuota));
        } else if (quota) {
          setCountdownSeconds(getRemainingSeconds(quota));
        }
        setCountdownOpen(true);
        return;
      }

      if (!session?.user && quota?.exhausted) {
        writePendingGeneration(params);
        const gateReason =
          quota.errorCode === 'ANON_BUCKET_LINKED_LOGIN_REQUIRED'
            ? 'anon_linked'
            : quota.errorCode === 'ANON_QUOTA_EXHAUSTED'
              ? 'anon_exhausted'
              : readLastGateReason();
        if (gateReason) {
          writeLastGateReason(gateReason);
          openLoginModal(gateReason);
          return;
        }
      }

      await submitGeneration(params);
    },
    [
      claimStatus,
      isSubmitting,
      openLoginModal,
      openUpgradeDialog,
      quota?.accessMode,
      quota?.errorCode,
      quota?.exhausted,
      quota?.nextRefillAt,
      refetchQuota,
      session?.user,
      setCountdownOpen,
      submitGeneration,
    ]
  );

  const retryClaim = useCallback(async () => {
    await attemptClaim({ resumePending: true });
  }, [attemptClaim]);

  const handleLoginSuccess = useCallback(async () => {
    await attemptClaim({ resumePending: true });
  }, [attemptClaim]);

  const handleLoginModalOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeLoginModal();
        if (!session?.user) {
          clearPendingGeneration();
          clearLastGateReason();
        }
        return;
      }

      openLoginModal(loginModalReason);
    },
    [closeLoginModal, loginModalReason, openLoginModal, session?.user]
  );

  const handleCountdownModalOpenChange = useCallback(
    (open: boolean) => {
      setCountdownOpen(open);
    },
    [setCountdownOpen]
  );

  const handleUpgradeDialogOpenChange = useCallback(
    (open: boolean, trigger?: UpgradeDialogTrigger) => {
      if (open && trigger) {
        setUpgradeDialogTrigger(trigger);
      }
      setIsUpgradeDialogOpen(open);
    },
    []
  );

  const selectRecentGeneration = useCallback(
    (generation: HomeRecentGeneration) => {
      const imageUrl =
        generation.outputImageUrlsR2[0] ||
        generation.outputImageUrls[0] ||
        generation.thumbnailUrl ||
        null;
      if (!imageUrl) return;

      setSelectedRecentId(generation.id);
      setResultImageUrl(imageUrl);
      setPreviewState('done');
      setErrorMessage(null);
      setProgress(100);
    },
    [
      setErrorMessage,
      setPreviewState,
      setProgress,
      setResultImageUrl,
      setSelectedRecentId,
    ]
  );

  const handleRetry = useCallback(() => {
    resetPreview();
  }, [resetPreview]);

  const handleCancelGeneration = useCallback(async () => {
    const activeJobId = inFlightJob?.jobId || readLastJobId();

    submitAttemptRef.current += 1;
    submitAbortControllerRef.current?.abort();
    submitAbortControllerRef.current = null;
    clearPollTimer();
    clearProgressTimer();
    clearLastJobId();
    setInFlightJob(null);
    setSubmitting(false);
    resetPreview();

    if (!activeJobId) {
      return;
    }

    try {
      const response = await fetch('/api/home/image/cancel/', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: activeJobId,
        }),
      });

      if (!response.ok && response.status !== 404) {
        throw new Error('Failed to cancel generation');
      }
    } catch {
      toast({
        title: tErrors('cancelFailed'),
        variant: 'destructive',
      });
    } finally {
      await Promise.all([
        refetchQuota({ silent: true }),
        refetchRecent({ silent: true }),
      ]);
    }
  }, [
    clearPollTimer,
    clearProgressTimer,
    inFlightJob?.jobId,
    refetchQuota,
    refetchRecent,
    resetPreview,
    setInFlightJob,
    setSubmitting,
    tErrors,
    toast,
  ]);

  useEffect(() => {
    void Promise.all([
      refetchQuota({ silent: false }),
      refetchRecent({ silent: false }),
    ]).then(async () => {
      const lastJobId = readLastJobId();
      if (!lastJobId) return;

      const recoveryStartedAt = Date.now();
      beginProgressSimulation();
      setInFlightJob({
        jobId: lastJobId,
        startedAt: recoveryStartedAt,
        modelId: readPendingGeneration()?.modelId || 'nano-banana-pro',
      });

      try {
        const payload = await pollJobStatus(lastJobId);
        const status = extractStatusValue(payload);

        if (isSuccessfulStatus(status)) {
          await finalizeSuccessfulJob(payload);
          return;
        }

        if (isFailedStatus(status)) {
          await finalizeFailedJob(payload);
          return;
        }

        trackInFlightJob(
          lastJobId,
          {
            modelId: readPendingGeneration()?.modelId || 'nano-banana-pro',
          },
          recoveryStartedAt
        );
      } catch {
        trackInFlightJob(
          lastJobId,
          {
            modelId: readPendingGeneration()?.modelId || 'nano-banana-pro',
          },
          recoveryStartedAt
        );
      }
    });

    return () => {
      clearPollTimer();
      clearProgressTimer();
    };
  }, [
    beginProgressSimulation,
    clearPollTimer,
    clearProgressTimer,
    finalizeFailedJob,
    finalizeSuccessfulJob,
    pollJobStatus,
    refetchQuota,
    refetchRecent,
    setInFlightJob,
    trackInFlightJob,
  ]);

  useEffect(() => {
    const userId = session?.user?.id ?? null;
    if (!userId) {
      claimAttemptedForUserRef.current = null;
      setClaimStatus('idle');
      return;
    }

    if (claimAttemptedForUserRef.current === userId) {
      return;
    }

    claimAttemptedForUserRef.current = userId;
    void attemptClaim({ resumePending: true });
  }, [attemptClaim, session?.user?.id, setClaimStatus]);

  useEffect(() => {
    const updateCountdown = async () => {
      if (!isCountdownOpen) {
        setCountdownSeconds(getRemainingSeconds(quota));
        return;
      }

      if (quota?.exhausted && !quota?.nextRefillAt) {
        const refreshKey = `missing:${quota.subjectType}:${quota.accessMode}:${quota.remaining}:${quota.errorCode ?? ''}`;
        if (cooldownRefreshKeyRef.current === refreshKey) {
          return;
        }
        cooldownRefreshKeyRef.current = refreshKey;
        await refetchQuota({ silent: true });
        return;
      }

      const nextSeconds = getRemainingSeconds(quota);
      setCountdownSeconds(nextSeconds);

      if (nextSeconds <= 0 && quota?.exhausted && quota?.nextRefillAt) {
        const refreshKey = `${quota.nextRefillAt}:${quota.remaining}`;
        if (cooldownRefreshKeyRef.current === refreshKey) {
          return;
        }
        cooldownRefreshKeyRef.current = refreshKey;
        const refreshedQuota = await refetchQuota({ silent: true });
        if (refreshedQuota && refreshedQuota.remaining > 0) {
          setCountdownOpen(false);
        }
      }
    };

    void updateCountdown();

    if (!isCountdownOpen || !quota?.nextRefillAt || !quota.exhausted) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void updateCountdown();
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isCountdownOpen, quota, refetchQuota, setCountdownOpen]);

  useEffect(() => {
    if (isCountdownOpen && quota && !quota.exhausted) {
      setCountdownOpen(false);
    }
  }, [isCountdownOpen, quota, setCountdownOpen]);

  useEffect(() => {
    const handleWake = () => {
      if (document.visibilityState !== 'visible') return;
      void refetchQuota({ silent: true });

      const lastJobId = readLastJobId();
      if (lastJobId) {
        void pollJobStatus(lastJobId)
          .then(async (payload) => {
            const status = extractStatusValue(payload);
            if (isSuccessfulStatus(status)) {
              await finalizeSuccessfulJob(payload);
              return;
            }
            if (isFailedStatus(status)) {
              await finalizeFailedJob(payload);
            }
          })
          .catch(() => {
            // keep the in-flight recovery path quiet on focus transitions
          });
      }
    };

    const handleFocus = () => {
      void refetchQuota({ silent: true });
    };

    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('focus', handleFocus);
    };
  }, [finalizeFailedJob, finalizeSuccessfulJob, pollJobStatus, refetchQuota]);

  const loginModalState = useMemo(
    () => ({
      open: isLoginModalOpen,
      reason: loginModalReason,
    }),
    [isLoginModalOpen, loginModalReason]
  );

  return {
    session,
    quota,
    recentGenerations,
    previewState,
    progress:
      previewState === 'generating' && inFlightJob
        ? simulatedProgress
        : progress,
    resultImageUrl,
    errorMessage,
    claimStatus,
    inFlightJob,
    selectedRecentId,
    isQuotaLoading,
    isRecentLoading,
    isGenerating: isSubmitting || previewState === 'generating',
    loginModalState,
    isCountdownOpen,
    isUpgradeDialogOpen,
    upgradeDialogTrigger,
    countdownSeconds,
    hasPendingGeneration: !!readPendingGeneration(),
    handleGenerate,
    handleCancelGeneration,
    handleRetry,
    handleLoginSuccess,
    handleLoginModalOpenChange,
    handleCountdownModalOpenChange,
    handleUpgradeDialogOpenChange,
    openUpgradeDialogPreservingPending,
    selectRecentGeneration,
    refetchQuota,
    refetchRecent,
    retryClaim,
    captchaDialog,
  };
}
