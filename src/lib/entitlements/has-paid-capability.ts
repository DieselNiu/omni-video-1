import { getUserCredits } from '@/credits/credits';
import {
  calculateImageCredits,
  getImageModel,
} from '@/image/config/image-models';
import { ENTITLEMENT_SCOPE } from './constants';
import { hasActiveEntitlement } from './entitlements';
import {
  shouldChargeCreditsForImage,
  shouldUseNanoEntitlement,
} from './nano-family';

export async function hasPaidCapability(params: {
  userId: string;
  modelId: string;
  resolution?: string;
}): Promise<boolean> {
  const modelConfig = getImageModel(params.modelId);
  if (!modelConfig) {
    return false;
  }

  let hasNanoEntitlement = false;
  try {
    hasNanoEntitlement = await hasActiveEntitlement(
      params.userId,
      ENTITLEMENT_SCOPE.NANO_FAMILY
    );
  } catch (error) {
    console.error('[hasPaidCapability] entitlement check failed:', error);
  }

  if (shouldUseNanoEntitlement(params.modelId, hasNanoEntitlement)) {
    return true;
  }

  if (!shouldChargeCreditsForImage(params.modelId, hasNanoEntitlement)) {
    return false;
  }

  const creditsNeeded = calculateImageCredits(
    params.modelId,
    params.resolution || (modelConfig.isProApi ? '1K' : undefined)
  );

  return (await getUserCredits(params.userId)) >= creditsNeeded;
}
