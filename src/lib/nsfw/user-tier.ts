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

  // Check for valid PAID credits (remaining > 0, not expired, excluding free/gifted/refund types)
  // Free types: REGISTER_GIFT, MONTHLY_REFRESH, GIFT — these don't indicate a paying user
  // Refund types: refunds restore previously consumed credits and don't indicate a paying user
  const FREE_CREDIT_TYPES = [
    CREDIT_TRANSACTION_TYPE.REGISTER_GIFT,
    CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
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

  if (validCredits.length > 0) {
    return 'credits';
  }

  return 'free';
}

export async function isPaidUser(userId: string): Promise<boolean> {
  const tier = await getUserPaymentTier(userId);
  return tier !== 'free';
}
