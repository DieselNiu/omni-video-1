'use client';

import { useEffect, useState } from 'react';

/**
 * Hook to track elapsed time from a start timestamp
 * @param startTime - Unix timestamp in milliseconds
 * @param enabled - Whether to track time (typically true during polling)
 * @returns Elapsed time in seconds
 */
export function useElapsedTime(
  startTime: number | undefined,
  enabled: boolean
): number {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (!enabled || !startTime) {
      setElapsedTime(0);
      return undefined;
    }

    // Calculate initial elapsed time
    setElapsedTime(Math.floor((Date.now() - startTime) / 1000));

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [enabled, startTime]);

  return elapsedTime;
}
