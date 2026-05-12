import { claimGuestQuota } from '@/credits/free-quota';
import { auth } from '@/lib/auth';
import {
  getGuestCookieName,
  verifyGuestCookieValue,
} from '@/lib/home-image-security';
import { cookies, headers } from 'next/headers';
import { jsonNoStore } from '../_lib/http';

export async function POST() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) {
    return jsonNoStore({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const guestId =
    (
      await verifyGuestCookieValue(
        cookieStore.get(getGuestCookieName())?.value ?? null
      )
    )?.id ?? null;
  const result = await claimGuestQuota({
    guestId,
    userId: session.user.id,
  });

  return jsonNoStore({
    claimedCount: result.claimedCount,
    withheld: result.withheld,
    userQuota: result.userBucket
      ? {
          remaining: result.userBucket.remaining,
          capacity: result.userBucket.capacity,
          policy: result.userBucket.policy,
          nextRefillAt: result.userBucket.nextRefillAt,
        }
      : null,
  });
}
