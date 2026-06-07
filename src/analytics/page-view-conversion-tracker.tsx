'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { reportPageViewConversion } from './google-ads-conversion';

/**
 * Fires the explicit Google Ads page-view conversion on hard loads and
 * App Router navigations.
 */
export function PageViewConversionTracker() {
  const pathname = usePathname();

  useEffect(() => {
    reportPageViewConversion();
  }, [pathname]);

  return null;
}
