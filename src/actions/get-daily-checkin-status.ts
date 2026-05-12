'use server';

import type { User } from '@/lib/auth-types';
import { getDailyCheckinStatus } from '@/lib/checkin/checkin-service';
import { userActionClient } from '@/lib/safe-action';

export const getDailyCheckinStatusAction = userActionClient.action(
  async ({ ctx }) => {
    const currentUser = (ctx as { user: User }).user;
    try {
      const status = await getDailyCheckinStatus(currentUser.id);
      return {
        success: true,
        data: status,
      };
    } catch (error) {
      console.error('get daily checkin status error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch daily check-in status',
      };
    }
  }
);
