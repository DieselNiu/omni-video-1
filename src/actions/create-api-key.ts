'use server';

import { ApiKeyError, createApiKey } from '@/lib/api-keys';
import type { User } from '@/lib/auth-types';
import { userActionClient } from '@/lib/safe-action';
import { z } from 'zod';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
});

/**
 * Create a new API key for the current user. Plaintext key is returned ONCE;
 * callers must display/copy it immediately — it cannot be retrieved again.
 */
export const createApiKeyAction = userActionClient
  .schema(schema)
  .action(async ({ parsedInput, ctx }) => {
    const user = (ctx as { user: User }).user;
    try {
      const created = await createApiKey({
        userId: user.id,
        name: parsedInput.name,
      });
      return {
        success: true as const,
        data: {
          id: created.id,
          name: created.name,
          plaintext: created.plaintext,
          keyPrefix: created.keyPrefix,
          createdAt: created.createdAt,
        },
      };
    } catch (error) {
      if (error instanceof ApiKeyError) {
        return {
          success: false as const,
          error: error.message,
          code: error.code,
          status: error.status,
        };
      }
      console.error('create api key error:', error);
      return {
        success: false as const,
        error:
          error instanceof Error ? error.message : 'Failed to create API key',
      };
    }
  });
