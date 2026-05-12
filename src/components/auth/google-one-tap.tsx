'use client';

import { websiteConfig } from '@/config/website';
import { authClient } from '@/lib/auth-client';
import { useOAuthCoordinationStore } from '@/stores/oauth-coordination-store';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

const ONE_TAP_INIT_DELAY_MS = 1200;

export function GoogleOneTap() {
  const { data: session, isPending, refetch } = authClient.useSession();
  const routerRef = useRef(useRouter());
  const isPopupActive = useOAuthCoordinationStore((s) => s.isPopupOAuthActive);

  useEffect(() => {
    if (!(websiteConfig.auth as Record<string, unknown>).enableGoogleOneTap)
      return;
    if (isPending) return;
    if (session?.user) return;
    if (isPopupActive) return;

    let cancelled = false;
    let timeoutId: number | undefined;
    const controller = new AbortController();

    const startOneTap = async () => {
      try {
        const response = await fetch('/api/auth/get-session/', {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        const serverSession = await response.json();

        if (cancelled || serverSession?.user) {
          try {
            (window as any).google?.accounts?.id?.cancel();
          } catch {}
          return;
        }
      } catch {
        if (cancelled) return;
      }

      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        if ('oneTap' in authClient) {
          void (authClient as any)
            .oneTap({
              fetchOptions: {
                onSuccess: async () => {
                  await refetch();
                  routerRef.current.refresh();
                },
              },
            })
            .catch((error: unknown) => {
              console.warn('Google One Tap failed to initialize', error);
            });
        }
      }, ONE_TAP_INIT_DELAY_MS);
    };

    void startOneTap();

    return () => {
      cancelled = true;
      controller.abort();
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      try {
        (window as any).google?.accounts?.id?.cancel();
      } catch {}
    };
  }, [session?.user, isPending, isPopupActive, refetch]);

  // Cancel any active One Tap prompt when login state becomes known or popup opens
  useEffect(() => {
    if (session?.user || isPopupActive) {
      try {
        (window as any).google?.accounts?.id?.cancel();
      } catch {}
    }
  }, [session?.user, isPopupActive]);

  return null;
}
