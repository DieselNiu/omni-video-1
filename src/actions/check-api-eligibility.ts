'use server';

import { userHasPaidHistory } from '@/lib/api-keys';
import type { User } from '@/lib/auth-types';
import { userActionClient } from '@/lib/safe-action';

/**
 * Check whether the current user is eligible to create API keys. Requires at
 * least one completed paid purchase (credit pack, subscription, or lifetime).
 */
export const checkApiEligibilityAction = userActionClient.action(
  async ({ ctx }) => {
    const user = (ctx as { user: User }).user;
    try {
      const eligible = await userHasPaidHistory(user.id);
      return { success: true as const, data: { eligible } };
    } catch (error) {
      console.error('check api eligibility error:', error);
      return {
        success: false as const,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to check API eligibility',
      };
    }
  }
);
