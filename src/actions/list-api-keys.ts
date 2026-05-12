'use server';

import { listApiKeys } from '@/lib/api-keys';
import type { User } from '@/lib/auth-types';
import { userActionClient } from '@/lib/safe-action';

/**
 * List all API keys (active + revoked) for the current user, newest first.
 */
export const listApiKeysAction = userActionClient.action(async ({ ctx }) => {
  const user = (ctx as { user: User }).user;
  try {
    const keys = await listApiKeys(user.id);
    return { success: true as const, data: keys };
  } catch (error) {
    console.error('list api keys error:', error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Failed to list API keys',
    };
  }
});
