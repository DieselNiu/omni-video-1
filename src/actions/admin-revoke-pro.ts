'use server';

import { getDb } from '@/db';
import { user } from '@/db/schema';
import { adminWriteActionClient } from '@/lib/safe-action';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const revokeProSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

export const adminRevokeProAction = adminWriteActionClient
  .schema(revokeProSchema)
  .action(async ({ parsedInput }) => {
    try {
      const { userId } = parsedInput;

      const db = await getDb();
      await db
        .update(user)
        .set({
          adminGrantedPro: false,
          adminGrantedProExpiresAt: null,
        })
        .where(eq(user.id, userId));

      return {
        success: true,
        data: { userId },
      };
    } catch (error) {
      console.error('admin revoke pro error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to revoke Pro',
      };
    }
  });
