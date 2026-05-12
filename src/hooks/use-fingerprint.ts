'use client';

import * as React from 'react';

let cachedFingerprint: string | null = null;

export function useFingerprint() {
  const [fingerprint, setFingerprint] = React.useState<string | null>(
    cachedFingerprint
  );
  const [isLoading, setIsLoading] = React.useState(!cachedFingerprint);

  React.useEffect(() => {
    if (cachedFingerprint) return;

    let cancelled = false;

    async function load() {
      try {
        const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        if (!cancelled) {
          cachedFingerprint = result.visitorId;
          setFingerprint(result.visitorId);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { fingerprint, isLoading };
}
