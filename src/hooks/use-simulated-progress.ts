'use client';

import { useMemo } from 'react';

export function getSimulatedProgress(
  elapsedTime: number,
  realProgress: number | undefined,
  isVideo: boolean
): number {
  if (realProgress != null && realProgress > 0) {
    return Math.min(realProgress, 99);
  }

  const maxTime = isVideo ? 180 : 90;
  const ratio = Math.min(elapsedTime / maxTime, 1);
  const simulated = Math.round(95 * (1 - Math.exp(-3 * ratio)));
  return Math.max(1, Math.min(simulated, 95));
}

export function useSimulatedProgress(
  elapsedTime: number,
  realProgress: number | undefined,
  isVideo: boolean
): number {
  return useMemo(
    () => getSimulatedProgress(elapsedTime, realProgress, isVideo),
    [elapsedTime, realProgress, isVideo]
  );
}
