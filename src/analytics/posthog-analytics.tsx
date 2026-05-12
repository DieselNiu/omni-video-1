'use client';

import { authClient } from '@/lib/auth-client';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect, useRef } from 'react';

/**
 * PostHog Analytics
 *
 * https://posthog.com
 * https://posthog.com/docs/libraries/next-js?tab=PostHog+provider
 * https://mksaas.com/docs/analytics#posthog
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  const isPostHogEnabled =
    posthogKey && posthogHost && process.env.NODE_ENV === 'production';

  useEffect(() => {
    if (isPostHogEnabled) {
      posthog.init(posthogKey, {
        api_host: posthogHost,
        defaults: '2025-05-24',
      });
    }
  }, [isPostHogEnabled, posthogKey, posthogHost]);

  // If PostHog is not enabled, just return children without the provider
  if (!isPostHogEnabled) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <PostHogIdentify />
      {children}
    </PHProvider>
  );
}

/**
 * Bridges Better Auth session state into PostHog identity.
 *
 * Calling posthog.identify(userId) on an anonymous visitor merges the prior
 * anonymous distinct_id history onto the new userId — so funnels like
 * anon_first_generation -> signup_completed stay coherent across the
 * pre/post-signup boundary instead of showing up as two separate people.
 *
 * posthog.reset() on logout prevents the next visitor on a shared browser
 * from being attributed to the logged-out user.
 */
function PostHogIdentify() {
  const { data: session } = authClient.useSession();
  const identifiedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user?.id ?? null;

    if (userId && identifiedUserIdRef.current !== userId) {
      posthog.identify(userId, {
        email: session?.user?.email,
        name: session?.user?.name,
      });
      identifiedUserIdRef.current = userId;
      return;
    }

    if (!userId && identifiedUserIdRef.current !== null) {
      posthog.reset();
      identifiedUserIdRef.current = null;
    }
  }, [session?.user?.id, session?.user?.email, session?.user?.name]);

  return null;
}
