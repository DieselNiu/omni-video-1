'use server';

import { getAllCreditPackages } from '@/credits/server';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import type { User } from '@/lib/auth-types';
import { findPlanByPriceId } from '@/lib/price-plan';
import { userActionClient } from '@/lib/safe-action';
import { and, desc, eq, gte } from 'drizzle-orm';
import { z } from 'zod';

const LOOKBACK_MS = 30 * 60 * 1000;

const recentPaidPaymentSchema = z
  .object({
    sessionId: z.string().optional(),
    paypalOrderId: z.string().optional(),
    paypalSubscriptionId: z.string().optional(),
    provider: z.enum(['stripe', 'paypal', 'nowpayments']).optional(),
  })
  .optional();

function findPaymentAmountByPriceId(priceId: string) {
  const plan = findPlanByPriceId(priceId);

  if (plan) {
    for (const price of plan.prices) {
      if (price.priceId === priceId) {
        return {
          amountMinor: price.amount,
          currency: price.currency,
        };
      }
    }

    if (plan.tiers) {
      for (const tier of plan.tiers) {
        const tierPrice = tier.prices.find((p) => p.priceId === priceId);
        if (tierPrice) {
          return {
            amountMinor: tierPrice.amount,
            currency: tierPrice.currency,
          };
        }
      }
    }
  }

  const creditPackage = getAllCreditPackages().find(
    (pkg) => pkg.price.priceId === priceId
  );
  if (creditPackage) {
    return {
      amountMinor: creditPackage.price.amount,
      currency: creditPackage.price.currency,
    };
  }

  return null;
}

/**
 * Return the current user's most recent paid payment, with dynamic amount in
 * major currency units. Used by /payment to report Google Ads purchase value.
 */
export const getRecentPaidPaymentAction = userActionClient
  .schema(recentPaidPaymentSchema)
  .action(async ({ parsedInput, ctx }) => {
    const db = await getDb();
    const since = new Date(Date.now() - LOOKBACK_MS);
    const identifiers = parsedInput ?? {};
    const currentUser = (ctx as { user: User }).user;

    const lookupConditions = [
      eq(payment.userId, currentUser.id),
      eq(payment.paid, true),
    ];

    if (identifiers.sessionId) {
      lookupConditions.push(eq(payment.sessionId, identifiers.sessionId));
    } else if (identifiers.paypalOrderId) {
      lookupConditions.push(
        eq(payment.paypalOrderId, identifiers.paypalOrderId)
      );
    } else if (identifiers.paypalSubscriptionId) {
      lookupConditions.push(
        eq(payment.paypalSubscriptionId, identifiers.paypalSubscriptionId)
      );
    } else {
      lookupConditions.push(gte(payment.updatedAt, since));
    }

    if (identifiers.provider) {
      lookupConditions.push(eq(payment.provider, identifiers.provider));
    }

    const [row] = await db
      .select({
        id: payment.id,
        priceId: payment.priceId,
        scene: payment.scene,
        provider: payment.provider,
      })
      .from(payment)
      .where(and(...lookupConditions))
      .orderBy(desc(payment.updatedAt))
      .limit(1);

    if (!row) return null;

    const price = findPaymentAmountByPriceId(row.priceId);
    if (!price) return null;

    return {
      txnId: row.id,
      amount: price.amountMinor / 100,
      currency: price.currency,
      provider: row.provider,
      scene: row.scene,
    };
  });
