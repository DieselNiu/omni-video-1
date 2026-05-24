'use client';

import { authClient } from '@/lib/auth-client';
import {
  AUTH_BROADCAST_CHANNEL,
  AUTH_HANDLED_RESET_DELAY,
  AUTH_POPUP_NONCE_KEY,
  AUTH_POPUP_RESULT_KEY,
  POPUP_HEIGHT,
  POPUP_POLL_INTERVAL,
  POPUP_SAFETY_TIMEOUT,
  POPUP_WIDTH,
} from '@/lib/auth/constants';
import { useOAuthCoordinationStore } from '@/stores/oauth-coordination-store';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export type PopupOAuthProvider = 'google' | 'yandex';

interface UsePopupOAuthOptions {
  onSuccess: () => void | Promise<void>;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
  /** The caller's refetchSession — ensures the caller's useSession() subscription updates. */
  refetchSession: () => void | Promise<unknown>;
}

/**
 * Manages popup-based OAuth login for Google (signIn.social) and Yandex
 * (signIn.oauth2 via genericOAuth plugin).
 *
 * Communication channels (3, all COOP-safe):
 * 1. BroadcastChannel — fast, cross-window, not affected by COOP
 * 2. localStorage storage event — reliable cross-window fallback
 * 3. Poll + localStorage check — belt-and-suspenders when popup closes
 *
 * NOTE: postMessage is intentionally NOT used because Google's
 * COOP: same-origin policy severs window.opener after OAuth redirects,
 * making postMessage permanently unreachable in this flow.
 */
export function usePopupOAuth({
  onSuccess,
  onCancel,
  onError,
  refetchSession,
}: UsePopupOAuthOptions) {
  const [loadingProvider, setLoadingProvider] =
    useState<PopupOAuthProvider | null>(null);
  const isLoading = loadingProvider !== null;
  const popupRef = useRef<Window | null>(null);
  const authHandledRef = useRef(false);
  const nonceRef = useRef<string>('');
  const authReceivedRef = useRef(false);
  const setPopupOAuthActive = useOAuthCoordinationStore(
    (s) => s.setPopupOAuthActive
  );
  const router = useRouter();

  const verifyNonce = useCallback((receivedNonce: string) => {
    return receivedNonce === nonceRef.current;
  }, []);

  const cleanupAuthStorage = useCallback(() => {
    try {
      localStorage.removeItem(AUTH_POPUP_NONCE_KEY);
      localStorage.removeItem(AUTH_POPUP_RESULT_KEY);
    } catch {}
  }, []);

  // Shared handler for auth success (called by any channel)
  const handleAuthSuccess = useCallback(async () => {
    if (authHandledRef.current) return;
    authHandledRef.current = true;
    authReceivedRef.current = true;

    popupRef.current = null;
    cleanupAuthStorage();

    // Server components + several Zustand stores were rendered against the
    // pre-login session and don't react to `refetch()` alone. A hard reload
    // is the only reliable way to flush stale auth-derived UI everywhere.
    // Schedule it first so it still runs even if onSuccess unmounts us.
    setTimeout(() => window.location.reload(), 0);
    try {
      await refetchSession();
      router.refresh();
      await onSuccess();
    } finally {
      setLoadingProvider(null);
      setPopupOAuthActive(false);

      setTimeout(() => {
        authHandledRef.current = false;
        authReceivedRef.current = false;
      }, AUTH_HANDLED_RESET_DELAY);
    }
  }, [
    onSuccess,
    setPopupOAuthActive,
    refetchSession,
    cleanupAuthStorage,
    router,
  ]);

  // Channel 1: BroadcastChannel
  useEffect(() => {
    if (!isLoading) return;
    if (typeof BroadcastChannel === 'undefined') return;

    const bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    bc.onmessage = (event) => {
      if (event.data?.type !== 'AUTH_SUCCESS') return;
      if (!verifyNonce(event.data.nonce)) return;
      handleAuthSuccess();
    };
    return () => bc.close();
  }, [isLoading, handleAuthSuccess, verifyNonce]);

  // Channel 2: localStorage storage event
  useEffect(() => {
    if (!isLoading) return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_POPUP_RESULT_KEY || !event.newValue) return;
      if (!verifyNonce(event.newValue)) return;
      handleAuthSuccess();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [isLoading, handleAuthSuccess, verifyNonce]);

  // Channel 3: Poll popup.closed, fall back to localStorage check
  useEffect(() => {
    if (!isLoading) return;

    const interval = setInterval(() => {
      if (!popupRef.current) return;

      let isClosed: boolean;
      try {
        isClosed = popupRef.current.closed;
      } catch {
        // COOP blocked closed access — give up polling; the other channels will handle it.
        popupRef.current = null;
        clearInterval(interval);
        return;
      }

      if (!isClosed) return;

      popupRef.current = null;
      clearInterval(interval);

      if (authReceivedRef.current) return;

      const resultNonce = localStorage.getItem(AUTH_POPUP_RESULT_KEY);
      if (resultNonce && verifyNonce(resultNonce)) {
        handleAuthSuccess();
        return;
      }

      // Belt-and-suspenders: if both channels missed but server has a session
      // (e.g. BroadcastChannel blocked, localStorage cleared by extension),
      // verify directly and treat that as success.
      fetch('/api/auth/get-session', { credentials: 'include' })
        .then((r) => r.json())
        .then((data) => {
          if (data?.user) {
            handleAuthSuccess();
          } else {
            cleanupAuthStorage();
            setLoadingProvider(null);
            setPopupOAuthActive(false);
            onCancel?.();
          }
        })
        .catch(() => {
          cleanupAuthStorage();
          setLoadingProvider(null);
          setPopupOAuthActive(false);
          onCancel?.();
        });
    }, POPUP_POLL_INTERVAL);

    const timeout = setTimeout(() => {
      if (popupRef.current) popupRef.current = null;
      cleanupAuthStorage();
      setLoadingProvider(null);
      setPopupOAuthActive(false);
    }, POPUP_SAFETY_TIMEOUT);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [
    isLoading,
    handleAuthSuccess,
    verifyNonce,
    onCancel,
    setPopupOAuthActive,
    cleanupAuthStorage,
  ]);

  const openPopup = useCallback(
    async (provider: PopupOAuthProvider) => {
      // Guard against double-clicks across both buttons
      if (loadingProvider) return;

      setLoadingProvider(provider);
      setPopupOAuthActive(true);

      // Open popup SYNCHRONOUSLY inside the user gesture to avoid blockers.
      const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
      const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;
      const popupFeatures = `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},toolbar=no,menubar=no`;
      const popup = window.open('', `${provider}-login`, popupFeatures);
      popupRef.current = popup;

      try {
        // Cancel any active Google One Tap prompt
        try {
          (
            window as {
              google?: { accounts?: { id?: { cancel?: () => void } } };
            }
          ).google?.accounts?.id?.cancel?.();
        } catch {}

        const nonce = crypto.randomUUID();
        nonceRef.current = nonce;
        localStorage.setItem(AUTH_POPUP_NONCE_KEY, nonce);

        const callbackURL = '/auth-callback';
        const errorCallbackURL = '/auth/error';

        const result =
          provider === 'google'
            ? await authClient.signIn.social({
                provider: 'google',
                callbackURL,
                errorCallbackURL,
                disableRedirect: true,
              })
            : await authClient.signIn.oauth2({
                providerId: 'yandex',
                callbackURL,
                errorCallbackURL,
                disableRedirect: true,
              });

        const url = result.data?.url;
        if (!url) {
          try {
            popup?.close();
          } catch {}
          cleanupAuthStorage();
          setLoadingProvider(null);
          setPopupOAuthActive(false);
          return;
        }

        if (popup) {
          try {
            if (popup.closed) {
              cleanupAuthStorage();
              setLoadingProvider(null);
              setPopupOAuthActive(false);
              onCancel?.();
              return;
            }
            popup.location.href = url;
          } catch (error) {
            cleanupAuthStorage();
            setLoadingProvider(null);
            setPopupOAuthActive(false);
            onError?.(error);
          }
        } else {
          // Popup blocked — fallback to full-page redirect
          setLoadingProvider(null);
          setPopupOAuthActive(false);
          window.location.href = url;
        }
      } catch (error) {
        try {
          popup?.close();
        } catch {}
        cleanupAuthStorage();
        setLoadingProvider(null);
        setPopupOAuthActive(false);
        toast.error('Failed to start login. Please try again.');
        onError?.(error);
      }
    },
    [
      loadingProvider,
      setPopupOAuthActive,
      onError,
      onCancel,
      cleanupAuthStorage,
    ]
  );

  const openGooglePopup = useCallback(() => openPopup('google'), [openPopup]);
  const openYandexPopup = useCallback(() => openPopup('yandex'), [openPopup]);

  return {
    isLoading,
    loadingProvider,
    openPopup,
    openGooglePopup,
    openYandexPopup,
  };
}
