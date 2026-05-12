import { finalizeHomeGenerationFailure } from './finalize-home-generation-failure';

export const HOME_IMAGE_STALE_TIMEOUT_MS = 10 * 60 * 1000;
export const HOME_IMAGE_STALE_ERROR_MESSAGE =
  'Generation timed out while waiting for provider updates. Please retry.';

export function isHomeGenerationInProgressStatus(status: string) {
  return ['PENDING', 'IN_QUEUE', 'IN_PROGRESS', 'PROCESSING'].includes(
    status.toUpperCase()
  );
}

export function isStaleHomeGeneration(updatedAt: Date, now: Date = new Date()) {
  return now.getTime() - updatedAt.getTime() >= HOME_IMAGE_STALE_TIMEOUT_MS;
}

export async function expireStaleHomeGeneration(params: {
  source: 'asset' | 'guest_generation';
  id: string;
  status: string;
  updatedAt: Date;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  if (
    !isHomeGenerationInProgressStatus(params.status) ||
    !isStaleHomeGeneration(params.updatedAt, now)
  ) {
    return false;
  }

  if (params.source === 'asset') {
    await finalizeHomeGenerationFailure({
      id: params.id,
      source: 'asset',
      status: 'FAILED',
      errorMessage: HOME_IMAGE_STALE_ERROR_MESSAGE,
    });
    return true;
  }

  await finalizeHomeGenerationFailure({
    id: params.id,
    source: 'guest_generation',
    status: 'FAILED',
    errorMessage: HOME_IMAGE_STALE_ERROR_MESSAGE,
    completedAt: now,
  });
  return true;
}
