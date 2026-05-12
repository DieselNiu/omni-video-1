import { getDb } from '@/db/index';
import { user } from '@/db/schema';
import { count, eq } from 'drizzle-orm';

const MAX_ACCOUNTS_PER_DEVICE = 3;

/**
 * Check if a device fingerprint is allowed to register a new account.
 * Same device is limited to MAX_ACCOUNTS_PER_DEVICE accounts.
 */
export async function checkDeviceFingerprint(fingerprint: string): Promise<{
  allowed: boolean;
  existingCount: number;
}> {
  const db = await getDb();
  const result = await db
    .select({ count: count() })
    .from(user)
    .where(eq(user.deviceFingerprint, fingerprint));

  const existingCount = result[0]?.count ?? 0;

  return {
    allowed: existingCount < MAX_ACCOUNTS_PER_DEVICE,
    existingCount,
  };
}

/**
 * Save a device fingerprint to a user record.
 */
export async function saveDeviceFingerprint(
  userId: string,
  fingerprint: string
): Promise<void> {
  const db = await getDb();
  await db
    .update(user)
    .set({ deviceFingerprint: fingerprint })
    .where(eq(user.id, userId));
}
