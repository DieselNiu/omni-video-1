'use client';

import { useEffect } from 'react';
import { reportSignupConversion } from './google-ads-conversion';

const COOKIE_NAME = 'pending_signup_conversion';

/**
 * Reads the one-time signup cookie set by Better Auth's new-user hook,
 * reports signup conversion, then clears the cookie.
 */
export function SignupConversionTracker() {
  useEffect(() => {
    if (
      !document.cookie.split('; ').some((c) => c.startsWith(`${COOKIE_NAME}=1`))
    ) {
      return;
    }
    reportSignupConversion();
    document.cookie = `${COOKIE_NAME}=; max-age=0; path=/`;
  }, []);

  return null;
}
