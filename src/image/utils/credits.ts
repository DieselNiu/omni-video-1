/**
 * Image generation credit utilities
 */

import { addCredits } from '@/credits/credits';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';

/**
 * Refund credits for failed image generation
 */
export async function refundImageCredits(
  userId: string,
  amount: number,
  modelId: string,
  recordId: string
): Promise<boolean> {
  try {
    await addCredits({
      userId,
      amount,
      type: CREDIT_TRANSACTION_TYPE.IMAGE_GENERATION_REFUND,
      description: `Image generation refund: ${modelId} (asset: ${recordId})`,
      expireDays: 30,
    });

    console.log(
      `[Image] Credits refunded: userId=${userId}, amount=${amount}, recordId=${recordId}`
    );

    return true;
  } catch (error) {
    console.error('[Image] Failed to refund credits:', error);
    return false;
  }
}
