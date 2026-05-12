'use client';

import { websiteConfig } from '@/config/website';
import { useCheckinAfterAuth } from '@/hooks/use-checkin-after-auth';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  PENDING_CHECKIN_EXPIRY,
  PENDING_CHECKIN_KEY,
} from '@/lib/auth/constants';
import { useDailyCheckinDialogStore } from '@/stores/daily-checkin-dialog-store';
import { useEffect, useRef } from 'react';

/**
 * Automatically claims daily check-in after a redirect-based login
 * (when popup was blocked and we fell back to full-page redirect).
 */
export function useAutoCheckinAfterLogin() {
  const currentUser = useCurrentUser();
  const openDialog = useDailyCheckinDialogStore((state) => state.openDialog);
  const isProcessingRef = useRef(false);
  const { claimAndNotify } = useCheckinAfterAuth({
    source: 'auto_checkin_after_login',
  });

  useEffect(() => {
    if (!websiteConfig.features.enableDailyCheckin) return;
    if (typeof window === 'undefined') return;

    const pendingCheckinTs = localStorage.getItem(PENDING_CHECKIN_KEY);
    if (!pendingCheckinTs) return;
    if (!currentUser) return;

    const ts = Number(pendingCheckinTs);
    const elapsed = Date.now() - ts;
    if (Number.isNaN(ts) || elapsed > PENDING_CHECKIN_EXPIRY || elapsed < 0) {
      localStorage.removeItem(PENDING_CHECKIN_KEY);
      return;
    }
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    localStorage.removeItem(PENDING_CHECKIN_KEY);

    const autoCheckin = async () => {
      try {
        await claimAndNotify();
        setTimeout(() => openDialog(), 500);
      } finally {
        setTimeout(() => {
          isProcessingRef.current = false;
        }, 2000);
      }
    };

    autoCheckin();
  }, [currentUser, claimAndNotify, openDialog]);
}
