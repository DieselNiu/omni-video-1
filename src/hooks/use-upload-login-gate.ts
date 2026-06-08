'use client';

import { authClient } from '@/lib/auth-client';
import { type UploadIntent, getUploadIntentConfig } from '@/storage/intents';
import { useLoginDialogStore } from '@/stores/login-dialog-store';
import { useCallback } from 'react';

/**
 * Guard for upload entry points (button click, drop). Call it BEFORE
 * opening the file picker: if the intent requires login and the user is a
 * guest, it opens the login dialog immediately and returns `false` so the
 * caller bails out — the user gets the login prompt the instant they click
 * "upload", instead of picking a file and only then being rejected.
 *
 * Guest-allowed intents (e.g. image-input) return `true` and proceed
 * normally.
 */
export function useUploadLoginGate() {
  const { data: session } = authClient.useSession();
  return useCallback(
    (intent: UploadIntent, onBlocked?: () => void): boolean => {
      const requiresLogin = getUploadIntentConfig(intent).auth === 'session';
      if (requiresLogin && !session?.user) {
        onBlocked?.();
        useLoginDialogStore.getState().openLoginDialog('feature_gated');
        return false;
      }
      return true;
    },
    [session?.user]
  );
}
