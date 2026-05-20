export const NANO_FAMILY_MODEL_IDS = [
  'nano-banana',
  'nano-banana-pro',
  'nano-banana-2',
] as const;

export function isNanoFamilyModel(modelId: string) {
  return NANO_FAMILY_MODEL_IDS.includes(
    modelId as (typeof NANO_FAMILY_MODEL_IDS)[number]
  );
}

export function shouldUseNanoEntitlement(
  modelId: string,
  hasNanoEntitlement: boolean
) {
  return isNanoFamilyModel(modelId) && hasNanoEntitlement;
}

export function shouldChargeCreditsForImage(
  modelId: string,
  hasNanoEntitlement: boolean
) {
  return !shouldUseNanoEntitlement(modelId, hasNanoEntitlement);
}
