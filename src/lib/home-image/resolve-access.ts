import { websiteConfig } from '@/config/website';
import { getUserCredits } from '@/credits/credits';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { calculateImageCredits } from '@/image/config/image-models';
import { PaymentScenes, PaymentTypes } from '@/payment/types';
import { and, eq } from 'drizzle-orm';

export const HOME_IMAGE_ACCESS_MODE = {
  GUEST_QUOTA: 'guest_quota',
  FREE_QUOTA: 'free_quota',
  CREDITS: 'credits',
  PURCHASE_REQUIRED: 'purchase_required',
  LOGIN_REQUIRED: 'login_required',
} as const;

export type HomeImageAccessMode =
  (typeof HOME_IMAGE_ACCESS_MODE)[keyof typeof HOME_IMAGE_ACCESS_MODE];

export interface HomeImageAccessResolution {
  mode: Exclude<HomeImageAccessMode, 'guest_quota' | 'login_required'>;
  currentCredits: number;
  hasSuccessfulCreditPurchase: boolean;
}

export function isClassicCreditsMode(): boolean {
  return websiteConfig.credits.mode === 'classic';
}

export async function hasSuccessfulCreditPurchase(
  userId: string
): Promise<boolean> {
  const db = await getDb();
  const [record] = await db
    .select({ id: payment.id })
    .from(payment)
    .where(
      and(
        eq(payment.userId, userId),
        eq(payment.paid, true),
        eq(payment.scene, PaymentScenes.CREDIT),
        eq(payment.type, PaymentTypes.ONE_TIME)
      )
    )
    .limit(1);

  return !!record;
}

export async function resolveHomeImageAccess(params: {
  userId: string;
  modelId: string;
  resolution?: string;
}): Promise<HomeImageAccessResolution> {
  const requiredCredits = Math.max(
    1,
    calculateImageCredits(params.modelId, params.resolution)
  );

  // Classic mode: every logged-in user runs purely on credits — no
  // free-quota fallback, no `hasSuccessfulCreditPurchase` gate. Sign-up
  // bonus credits (registerGiftCredits) seed the initial balance; once
  // they run out, the user must purchase.
  if (isClassicCreditsMode()) {
    const currentCredits = await getUserCredits(params.userId);
    if (currentCredits >= requiredCredits) {
      return {
        mode: HOME_IMAGE_ACCESS_MODE.CREDITS,
        currentCredits,
        hasSuccessfulCreditPurchase: false,
      };
    }
    return {
      mode: HOME_IMAGE_ACCESS_MODE.PURCHASE_REQUIRED,
      currentCredits,
      hasSuccessfulCreditPurchase: false,
    };
  }

  const [currentCredits, convertedCustomer] = await Promise.all([
    getUserCredits(params.userId),
    hasSuccessfulCreditPurchase(params.userId),
  ]);

  if (convertedCustomer && currentCredits >= requiredCredits) {
    return {
      mode: HOME_IMAGE_ACCESS_MODE.CREDITS,
      currentCredits,
      hasSuccessfulCreditPurchase: true,
    };
  }

  if (convertedCustomer) {
    return {
      mode: HOME_IMAGE_ACCESS_MODE.PURCHASE_REQUIRED,
      currentCredits: 0,
      hasSuccessfulCreditPurchase: true,
    };
  }

  return {
    mode: HOME_IMAGE_ACCESS_MODE.FREE_QUOTA,
    currentCredits: 0,
    hasSuccessfulCreditPurchase: false,
  };
}
