'use client';

import { authClient } from '@/lib/auth-client';
import {
  AUTH_BROADCAST_CHANNEL,
  AUTH_HANDLED_RESET_DELAY,
  AUTH_POPUP_NONCE_KEY,
  AUTH_POPUP_RESULT_KEY,
  PENDING_CHECKIN_KEY,
  POPUP_HEIGHT,
  POPUP_POLL_INTERVAL,
  POPUP_SAFETY_TIMEOUT,
  POPUP_WIDTH,
} from '@/lib/auth/constants';
import { useOAuthCoordinationStore } from '@/stores/oauth-coordination-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface UsePopupOAuthOptions {
  onSuccess: () => void | Promise<void>;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
  /** The caller's refetchSession — ensures the caller's useSession() subscription updates. */
  refetchSession: () => void | Promise<unknown>;
}

/**
 * Manages the full popup-based OAuth flow.
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
  const [isLoading, setIsLoading] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const authHandledRef = useRef(false);
  const nonceRef = useRef<string>('');
  const authReceivedRef = useRef(false);
  const setPopupOAuthActive = useOAuthCoordinationStore(
    (s) => s.setPopupOAuthActive
  );

  const verifyNonce = useCallback((receivedNonce: string) => {
    return receivedNonce === nonceRef.current;
  }, []);

  // Shared handler for auth success (called by any channel)
  const handleAuthSuccess = useCallback(async () => {
    if (authHandledRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log(
          '[popup-oauth] handleAuthSuccess skipped (already handled)'
        );
      }
      return;
    }
    authHandledRef.current = true;
    authReceivedRef.current = true;

    if (process.env.NODE_ENV === 'development') {
      console.log('[popup-oauth] handleAuthSuccess started');
    }

    popupRef.current = null;

    // Clean up localStorage
    try {
      localStorage.removeItem(AUTH_POPUP_NONCE_KEY);
      localStorage.removeItem(AUTH_POPUP_RESULT_KEY);
    } catch {}

    try {
      await refetchSession();
      await onSuccess();
    } finally {
      setIsLoading(false);
      setPopupOAuthActive(false);

      setTimeout(() => {
        authHandledRef.current = false;
        authReceivedRef.current = false;
      }, AUTH_HANDLED_RESET_DELAY);
    }
  }, [onSuccess, setPopupOAuthActive, refetchSession]);

  // Channel 1: BroadcastChannel (fast, not affected by COOP)
  useEffect(() => {
    if (!isLoading) return;
    if (typeof BroadcastChannel === 'undefined') return;

    const bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    bc.onmessage = (event) => {
      if (event.data?.type !== 'AUTH_SUCCESS') return;
      if (!verifyNonce(event.data.nonce)) return;
      if (process.env.NODE_ENV === 'development') {
        console.log('[popup-oauth] auth received via BroadcastChannel');
      }
      handleAuthSuccess();
    };

    return () => bc.close();
  }, [isLoading, handleAuthSuccess, verifyNonce]);

  // Channel 2: localStorage storage event (reliable cross-window fallback)
  useEffect(() => {
    if (!isLoading) return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_POPUP_RESULT_KEY || !event.newValue) return;
      if (!verifyNonce(event.newValue)) return;
      if (process.env.NODE_ENV === 'development') {
        console.log('[popup-oauth] auth received via storage event');
      }
      handleAuthSuccess();
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [isLoading, handleAuthSuccess, verifyNonce]);

  // Channel 3: Poll — detect popup closed, check localStorage as last resort
  useEffect(() => {
    if (!isLoading) return;

    const interval = setInterval(() => {
      if (!popupRef.current) return;

      // COOP can block popup.closed access after cross-origin OAuth redirects.
      let isClosed: boolean;
      try {
        isClosed = popupRef.current.closed;
      } catch {
        // COOP blocked — stop polling, rely on BroadcastChannel / storage event.
        popupRef.current = null;
        clearInterval(interval);
        return;
      }

      if (isClosed) {
        popupRef.current = null;
        clearInterval(interval);

        if (authReceivedRef.current) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[popup-oauth] popup closed, auth already received');
          }
          return;
        }

        // Last resort: check localStorage flag directly
        const resultNonce = localStorage.getItem(AUTH_POPUP_RESULT_KEY);
        if (resultNonce && verifyNonce(resultNonce)) {
          if (process.env.NODE_ENV === 'development') {
            console.log(
              '[popup-oauth] auth received via poll localStorage check'
            );
          }
          handleAuthSuccess();
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log('[popup-oauth] popup closed, no auth received');
          }
          setIsLoading(false);
          setPopupOAuthActive(false);
          onCancel?.();
        }
      }
    }, POPUP_POLL_INTERVAL);

    // Safety timeout: if still loading after 2 minutes, reset
    const timeout = setTimeout(() => {
      if (popupRef.current) {
        popupRef.current = null;
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('[popup-oauth] timeout reached, resetting loading state');
      }
      setIsLoading(false);
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
  ]);

  const openGooglePopup = useCallback(async () => {
    setIsLoading(true);
    setPopupOAuthActive(true);

    try {
      // Cancel any active One Tap prompt
      try {
        (window as any).google?.accounts?.id?.cancel();
      } catch {}

      const nonce = crypto.randomUUID();
      nonceRef.current = nonce;
      localStorage.setItem(AUTH_POPUP_NONCE_KEY, nonce);

      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/auth-callback',
        errorCallbackURL: '/auth/error',
        disableRedirect: true,
      });

      const url = result.data?.url;
      if (!url) {
        setIsLoading(false);
        setPopupOAuthActive(false);
        return;
      }

      const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
      const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;
      const popup = window.open(
        url,
        'google-login',
        `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},toolbar=no,menubar=no`
      );

      if (popup) {
        popupRef.current = popup;
      } else {
        // Popup blocked — fallback to redirect
        setIsLoading(false);
        setPopupOAuthActive(false);
        localStorage.setItem(PENDING_CHECKIN_KEY, Date.now().toString());
        window.location.href = url;
      }
    } catch (error) {
      setIsLoading(false);
      setPopupOAuthActive(false);
      toast.error('Failed to start login. Please try again.');
      onError?.(error);
    }
  }, [setPopupOAuthActive, onError]);

  return { isLoading, openGooglePopup };
}
