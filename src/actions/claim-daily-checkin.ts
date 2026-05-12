'use server';

import type { User } from '@/lib/auth-types';
import { claimDailyCheckin } from '@/lib/checkin/checkin-service';
import { userActionClient } from '@/lib/safe-action';

export const claimDailyCheckinAction = userActionClient.action(
  async ({ ctx }) => {
    const currentUser = (ctx as { user: User }).user;
    try {
      const result = await claimDailyCheckin(currentUser.id);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('claim daily checkin error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to claim daily check-in reward',
      };
    }
  }
);
