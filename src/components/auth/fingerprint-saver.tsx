'use client';

import { saveFingerprintAction } from '@/actions/save-fingerprint';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { authClient } from '@/lib/auth-client';
import { useEffect, useRef } from 'react';

/**
 * Invisible component that saves the device fingerprint for logged-in users.
 * Place this in a layout that renders for authenticated users.
 */
export function FingerprintSaver() {
  const { data: session } = authClient.useSession();
  const { fingerprint } = useFingerprint();
  const savedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (userId && fingerprint && savedForUserRef.current !== userId) {
      savedForUserRef.current = userId;
      saveFingerprintAction({ fingerprint }).catch(() => {
        // Reset so it can retry on next render, but only for this user
        savedForUserRef.current = null;
      });
    }
  }, [session?.user?.id, fingerprint]);

  return null;
}
