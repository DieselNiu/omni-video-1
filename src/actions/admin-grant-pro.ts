'use server';

import { getDb } from '@/db';
import { user } from '@/db/schema';
import { adminActionClient } from '@/lib/safe-action';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const grantProSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  expireDays: z.number().min(1).optional(),
});

export const adminGrantProAction = adminActionClient
  .schema(grantProSchema)
  .action(async ({ parsedInput }) => {
    try {
      const { userId, expireDays } = parsedInput;

      const expiresAt = expireDays
        ? new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000)
        : null;

      const db = await getDb();
      await db
        .update(user)
        .set({
          adminGrantedPro: true,
          adminGrantedProExpiresAt: expiresAt,
        })
        .where(eq(user.id, userId));

      return {
        success: true,
        data: { userId, expiresAt },
      };
    } catch (error) {
      console.error('admin grant pro error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to grant Pro',
      };
    }
  });
