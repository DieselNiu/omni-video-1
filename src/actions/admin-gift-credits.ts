'use server';

import { addCredits } from '@/credits/credits';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { adminWriteActionClient } from '@/lib/safe-action';
import { z } from 'zod';

const giftCreditsSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  amount: z.number().min(1, 'Amount must be at least 1'),
  expireDays: z.number().min(1).optional(),
  note: z.string().optional(),
});

export const adminGiftCreditsAction = adminWriteActionClient
  .schema(giftCreditsSchema)
  .action(async ({ parsedInput }) => {
    try {
      const { userId, amount, expireDays, note } = parsedInput;

      const description = note
        ? `Gift: ${amount} credits - ${note}`
        : `Gift: ${amount} credits`;

      await addCredits({
        userId,
        amount,
        type: CREDIT_TRANSACTION_TYPE.GIFT,
        description,
        expireDays,
      });

      return {
        success: true,
        data: { amount },
      };
    } catch (error) {
      console.error('admin gift credits error:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to gift credits',
      };
    }
  });
