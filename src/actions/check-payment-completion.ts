'use server';

import { randomUUID } from 'crypto';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import type { User } from '@/lib/auth-types';
import { userActionClient } from '@/lib/safe-action';
import { PaymentScenes, PaymentTypes, PlanIntervals } from '@/payment/types';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { z } from 'zod';

const checkPaymentCompletionSchema = z.object({
  sessionId: z.string(),
});

/**
 * Check if a payment is completed for the given session ID
 */
export const checkPaymentCompletionAction = userActionClient
  .schema(checkPaymentCompletionSchema)
  .action(async ({ parsedInput: { sessionId }, ctx }) => {
    try {
      const db = await getDb();
      const currentUser = (ctx as { user: User }).user;
      const paymentRecord = await db
        .select()
        .from(payment)
        .where(eq(payment.sessionId, sessionId))
        .limit(1);

      const paymentData = paymentRecord[0] || null;
      if (paymentData && paymentData.userId !== currentUser.id) {
        return {
          success: true,
          isPaid: false,
        };
      }

      if (paymentData?.paid) {
        console.log('Check payment completion, isPaid:', true);
        return {
          success: true,
          isPaid: true,
        };
      }

      if (paymentData?.provider === 'nowpayments') {
        console.log('Check payment completion, waiting for provider webhook');
        return {
          success: true,
          isPaid: false,
        };
      }

      if (!process.env.STRIPE_SECRET_KEY) {
        console.log('Check payment completion, missing Stripe secret key');
        return {
          success: true,
          isPaid: false,
        };
      }

      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== 'paid') {
        console.log('Stripe session not paid yet:', session.payment_status);
        return {
          success: true,
          isPaid: false,
        };
      }

      const metadata = session.metadata ?? {};
      if (metadata.userId && metadata.userId !== currentUser.id) {
        return {
          success: true,
          isPaid: false,
        };
      }

      const currentDate = new Date();
      const isSubscription = session.mode === 'subscription';
      const isCreditPurchase = metadata.type === 'credit_purchase';
      const scene = isCreditPurchase
        ? PaymentScenes.CREDIT
        : isSubscription
          ? PaymentScenes.SUBSCRIPTION
          : PaymentScenes.LIFETIME;
      const status = isSubscription ? 'active' : 'completed';
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : null;
      const invoiceId =
        typeof session.invoice === 'string' ? session.invoice : null;
      const customerId =
        typeof session.customer === 'string' ? session.customer : '';
      const interval = isSubscription
        ? metadata.interval === PlanIntervals.YEAR
          ? PlanIntervals.YEAR
          : PlanIntervals.MONTH
        : null;
      const priceId = metadata.priceId || paymentData?.priceId || '';

      if (paymentData) {
        await db
          .update(payment)
          .set({
            priceId,
            scene,
            interval,
            customerId: customerId || paymentData.customerId,
            subscriptionId: subscriptionId || paymentData.subscriptionId,
            invoiceId: invoiceId || paymentData.invoiceId,
            paid: true,
            status,
            updatedAt: currentDate,
          })
          .where(eq(payment.id, paymentData.id));
      } else {
        await db.insert(payment).values({
          id: randomUUID(),
          priceId,
          type: isSubscription
            ? PaymentTypes.SUBSCRIPTION
            : PaymentTypes.ONE_TIME,
          scene,
          interval,
          userId: currentUser.id,
          customerId,
          subscriptionId,
          sessionId,
          invoiceId,
          provider: 'stripe',
          paid: true,
          status,
          createdAt: currentDate,
          updatedAt: currentDate,
        });
      }

      return {
        success: true,
        isPaid: true,
      };
    } catch (error) {
      console.error('Check payment completion error:', error);
      return {
        success: false,
        error: 'Failed to check payment completion',
      };
    }
  });
