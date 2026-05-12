import { addCredits, consumeCredits, getUserCredits } from '@/credits/credits';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import {
  calculateVideoCredits as calculateCredits,
  getVideoModel,
} from './config/video-models';

export interface CreditDeductionInfo {
  totalDeducted: number;
  deductedAt: string;
  modelId: string;
  duration: number;
  hasAudio: boolean;
  resolution?: string;
}

/**
 * Calculate credits required for video generation
 * @param modelId - The model ID
 * @param duration - Duration in seconds
 * @param hasAudio - Whether audio is enabled
 * @param resolution - Video resolution (e.g., '720p', '1080p')
 * @returns Required credits
 */
export function calculateVideoCredits(
  modelId: string,
  duration: number,
  hasAudio = false,
  resolution?: string
): number {
  return calculateCredits(modelId, duration, hasAudio, resolution);
}

/**
 * Check if user has enough credits for video generation
 * @param userId - User ID
 * @param modelId - Model ID
 * @param duration - Duration in seconds
 * @param hasAudio - Whether audio is enabled
 * @param resolution - Video resolution (e.g., '720p', '1080p')
 * @returns Whether user has enough credits
 */
export async function hasEnoughCreditsForVideo(
  userId: string,
  modelId: string,
  duration: number,
  hasAudio = false,
  resolution?: string
): Promise<{ hasEnough: boolean; required: number; current: number }> {
  const required = calculateVideoCredits(
    modelId,
    duration,
    hasAudio,
    resolution
  );
  const current = await getUserCredits(userId);
  return {
    hasEnough: current >= required,
    required,
    current,
  };
}

/**
 * Consume credits for video generation
 * @param userId - User ID
 * @param modelId - Model ID
 * @param duration - Duration in seconds
 * @param hasAudio - Whether audio is enabled
 * @param resolution - Video resolution (e.g., '720p', '1080p')
 * @param assetId - Optional asset ID to link the transaction
 * @returns Credit deduction info for potential refund
 */
export async function consumeVideoCredits(
  userId: string,
  modelId: string,
  duration: number,
  hasAudio = false,
  resolution?: string,
  assetId?: string
): Promise<CreditDeductionInfo> {
  const model = getVideoModel(modelId);
  const amount = calculateVideoCredits(modelId, duration, hasAudio, resolution);

  if (amount <= 0) {
    throw new Error('Invalid credit amount');
  }

  const resolutionStr = resolution ? `, ${resolution}` : '';
  const description = `Video generation: ${model?.displayName || modelId} (${duration}s${resolutionStr}${hasAudio ? ', with audio' : ''})`;

  // Use existing consumeCredits function which handles FIFO logic
  await consumeCredits({
    userId,
    amount,
    description,
  });

  return {
    totalDeducted: amount,
    deductedAt: new Date().toISOString(),
    modelId,
    duration,
    hasAudio,
    resolution,
  };
}

/**
 * Refund credits for failed video generation
 * @param userId - User ID
 * @param deductionInfo - Credit deduction info from consumeVideoCredits
 * @param assetId - Optional asset ID to link the refund transaction
 */
export async function refundVideoCredits(
  userId: string,
  deductionInfo: CreditDeductionInfo,
  assetId?: string
): Promise<void> {
  if (!deductionInfo || deductionInfo.totalDeducted <= 0) {
    console.warn('Invalid deduction info for refund');
    return;
  }

  const model = getVideoModel(deductionInfo.modelId);
  const description = `Video generation refund: ${model?.displayName || deductionInfo.modelId} (${deductionInfo.duration}s${deductionInfo.hasAudio ? ', with audio' : ''})`;

  // Add credits back using existing addCredits function
  await addCredits({
    userId,
    amount: deductionInfo.totalDeducted,
    type: CREDIT_TRANSACTION_TYPE.VIDEO_GENERATION_REFUND,
    description,
    // Refunded credits expire in 30 days
    expireDays: 30,
  });

  console.log(
    `Refunded ${deductionInfo.totalDeducted} credits to user ${userId} for failed video generation`
  );
}

/**
 * Get remaining credits after video generation
 * @param userId - User ID
 * @returns Remaining credits
 */
export async function getRemainingCredits(userId: string): Promise<number> {
  return getUserCredits(userId);
}
