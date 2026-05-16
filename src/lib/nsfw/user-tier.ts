import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { getDb } from '@/db';
import { creditTransaction, payment, user } from '@/db/schema';
import { PaymentTypes } from '@/payment/types';
import { and, eq, gt, inArray, isNull, not, or } from 'drizzle-orm';

export type UserPaymentTier = 'free' | 'subscription' | 'credits';

export async function getUserPaymentTier(
  userId: string
): Promise<UserPaymentTier> {
  const db = await getDb();

  const [userData] = await db
    .select({
      adminGrantedPro: user.adminGrantedPro,
      adminGrantedProExpiresAt: user.adminGrantedProExpiresAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (
    userData?.adminGrantedPro &&
    (!userData.adminGrantedProExpiresAt ||
      userData.adminGrantedProExpiresAt > new Date())
  ) {
    return 'subscription';
  }

  const subscriptions = await db
    .select()
    .from(payment)
    .where(
      and(
        eq(payment.userId, userId),
        eq(payment.type, PaymentTypes.SUBSCRIPTION),
        inArray(payment.status, ['active', 'trialing'])
      )
    )
    .limit(1);

  if (subscriptions.length > 0) {
    return 'subscription';
  }

  if (await hasPaidCredits(userId)) {
    return 'credits';
  }

  return 'free';
}

/**
 * Whether the user has a remaining balance of PAID credits — i.e. credits
 * that came from a credit-pack purchase, not from sign-up gifts, daily
 * check-ins, monthly subscription refreshes, manual gifts, or refunds.
 *
 * Exported so client-side paid-feature gates (via a server action) can
 * use the same logic as the server-side `isPaidUser` check, keeping the
 * "credit-pack-only" user case consistent across the boundary.
 */
export async function hasPaidCredits(userId: string): Promise<boolean> {
  const db = await getDb();
  const FREE_CREDIT_TYPES = [
    CREDIT_TRANSACTION_TYPE.REGISTER_GIFT,
    CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
    CREDIT_TRANSACTION_TYPE.DAILY_CHECKIN,
    CREDIT_TRANSACTION_TYPE.GIFT,
    CREDIT_TRANSACTION_TYPE.VIDEO_GENERATION_REFUND,
    CREDIT_TRANSACTION_TYPE.IMAGE_GENERATION_REFUND,
    CREDIT_TRANSACTION_TYPE.REFUND,
  ];
  const validCredits = await db
    .select()
    .from(creditTransaction)
    .where(
      and(
        eq(creditTransaction.userId, userId),
        gt(creditTransaction.remainingAmount, 0),
        not(inArray(creditTransaction.type, FREE_CREDIT_TYPES)),
        or(
          isNull(creditTransaction.expirationDate),
          gt(creditTransaction.expirationDate, new Date())
        )
      )
    )
    .limit(1);
  return validCredits.length > 0;
}

export async function isPaidUser(userId: string): Promise<boolean> {
  const tier = await getUserPaymentTier(userId);
  return tier !== 'free';
}
