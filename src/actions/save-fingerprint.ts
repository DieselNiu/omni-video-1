'use server';

import { getDb } from '@/db/index';
import { user } from '@/db/schema';
import type { User } from '@/lib/auth-types';
import { saveDeviceFingerprint } from '@/lib/fingerprint';
import { userActionClient } from '@/lib/safe-action';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const schema = z.object({
  fingerprint: z.string().min(1),
});

export const saveFingerprintAction = userActionClient
  .schema(schema)
  .action(async ({ parsedInput: { fingerprint }, ctx }) => {
    const currentUser = (ctx as { user: User }).user;
    // Check if user already has a fingerprint stored
    const db = await getDb();
    const [existing] = await db
      .select({ deviceFingerprint: user.deviceFingerprint })
      .from(user)
      .where(eq(user.id, currentUser.id))
      .limit(1);

    if (!existing?.deviceFingerprint) {
      await saveDeviceFingerprint(currentUser.id, fingerprint);
    }
    return { success: true };
  });
