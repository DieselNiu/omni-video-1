'use server';

import { revokeApiKey } from '@/lib/api-keys';
import type { User } from '@/lib/auth-types';
import { userActionClient } from '@/lib/safe-action';
import { z } from 'zod';

const schema = z.object({
  keyId: z.string().min(1),
});

/**
 * Revoke an API key owned by the current user. No-op if already revoked or
 * not owned — returns `{ revoked: false }` in those cases.
 */
export const revokeApiKeyAction = userActionClient
  .schema(schema)
  .action(async ({ parsedInput, ctx }) => {
    const user = (ctx as { user: User }).user;
    try {
      const revoked = await revokeApiKey({
        userId: user.id,
        keyId: parsedInput.keyId,
      });
      return { success: true as const, data: { revoked } };
    } catch (error) {
      console.error('revoke api key error:', error);
      return {
        success: false as const,
        error:
          error instanceof Error ? error.message : 'Failed to revoke API key',
      };
    }
  });
