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
  // better-auth's useSession returns a new `refetch` reference on every atom
  // emit. Putting it in the effect deps caused the effect to re-run rapidly
  // on first visit, which fired a storm of /api/auth/get-session fetches and
  // exhausted Chrome's per-origin socket pool (ERR_INSUFFICIENT_RESOURCES).
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (!(websiteConfig.auth as Record<string, unknown>).enableGoogleOneTap)
      return;
    if (isPending) return;
    if (session?.user) return;
    if (isPopupActive) return;

    let cancelled = false;

    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      // Don't gate with `'oneTap' in authClient`: better-auth's client is a
      // Proxy whose `has` trap doesn't surface plugin-provided actions, so
      // the `in` check returns false even when authClient.oneTap is callable.
      // Trust that oneTapClient() is registered in src/lib/auth-client.ts.
      void (authClient as any)
        .oneTap({
          fetchOptions: {
            // Mirror wan27: `await refetch()` schedules a microtask so the
            // better-auth session atom has a tick to emit before
            // router.refresh() goes off to re-render server components with
            // the new auth cookie. refetch's declared return type is void,
            // but awaiting it is still meaningful for ordering.
            onSuccess: async () => {
              await refetchRef.current();
              routerRef.current.refresh();
            },
          },
        })
        .catch((error: unknown) => {
          console.warn('Google One Tap failed to initialize', error);
        });
    }, ONE_TAP_INIT_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      try {
        (window as any).google?.accounts?.id?.cancel();
      } catch {}
    };
  }, [session?.user, isPending, isPopupActive]);

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
