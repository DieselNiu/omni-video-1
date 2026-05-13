'use server';

import { websiteConfig } from '@/config/website';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { isDemoWebsite } from '@/lib/demo';
import { findPlanByPriceId, findPriceInPlan } from '@/lib/price-plan';
import { adminActionClient } from '@/lib/safe-action';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

// Schema for getPaymentStats (no parameters needed)
const getPaymentStatsSchema = z.object({});

/**
 * Get the amount for a payment based on its priceId and scene
 * @param priceId Stripe price ID
 * @param scene Payment scene: 'subscription', 'lifetime', or 'credit'
 * @returns Amount in cents, or 0 if not found
 */
function getPaymentAmount(priceId: string, scene: string | null): number {
  // Handle subscription and lifetime payments
  if (scene === 'subscription' || scene === 'lifetime') {
    const plan = findPlanByPriceId(priceId);
    if (!plan) {
      console.warn(
        `Payment amount lookup: Plan not found for priceId ${priceId}`
      );
      return 0;
    }

    const price = findPriceInPlan(plan.id, priceId);
    if (!price) {
      console.warn(
        `Payment amount lookup: Price not found for priceId ${priceId} in plan ${plan.id}`
      );
      return 0;
    }

    return price.amount;
  }

  // Handle credit purchases
  if (scene === 'credit') {
    const packages = Object.values(websiteConfig.credits.packages);
    const pkg = packages.find((p) => p.price.priceId === priceId);
    if (!pkg) {
      console.warn(
        `Payment amount lookup: Credit package not found for priceId ${priceId}`
      );
      return 0;
    }

    return pkg.price.amount;
  }

  console.warn(
    `Payment amount lookup: Unknown scene "${scene}" for priceId ${priceId}`
  );
  return 0;
}

// Create a safe action for getting payment statistics
export const getPaymentStatsAction = adminActionClient
  .schema(getPaymentStatsSchema)
  .action(async () => {
    try {
      // Return fake data in demo mode
      if (isDemoWebsite()) {
        return {
          success: true,
          data: {
            totalRevenue: 125000, // $1,250.00
            todayRevenue: 18500, // $185.00
            currency: 'USD',
          },
        };
      }

      const db = await getDb();

      // Get all paid payments
      const paidPayments = await db
        .select({
          priceId: payment.priceId,
          scene: payment.scene,
          createdAt: payment.createdAt,
        })
        .from(payment)
        .where(eq(payment.paid, true));

      // Calculate start of today in Beijing time (UTC+8), converted to UTC instant
      const BJ_OFFSET_MS = 8 * 60 * 60 * 1000;
      const bjNow = new Date(Date.now() + BJ_OFFSET_MS);
      bjNow.setUTCHours(0, 0, 0, 0);
      const today = new Date(bjNow.getTime() - BJ_OFFSET_MS);

      let totalRevenue = 0;
      let todayRevenue = 0;

      for (const p of paidPayments) {
        const amount = getPaymentAmount(p.priceId, p.scene);
        totalRevenue += amount;

        // Check if payment was created today
        if (p.createdAt >= today) {
          todayRevenue += amount;
        }
      }

      return {
        success: true,
        data: {
          totalRevenue,
          todayRevenue,
          currency: 'USD',
        },
      };
    } catch (error) {
      console.error('get payment stats error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch payment statistics',
      };
    }
  });
