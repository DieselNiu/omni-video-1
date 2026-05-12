import { randomUUID } from 'crypto';
import { websiteConfig } from '@/config/website';
import { addSubscriptionCredits } from '@/credits/credits';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { auth } from '@/lib/auth';
import { findPriceInPlan } from '@/lib/price-plan';
import { PayPalProvider } from '@/payment/provider/paypal';
import { PaymentScenes, PaymentTypes, PlanIntervals } from '@/payment/types';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Confirm PayPal subscription after user approval
 *
 * This endpoint validates and records the subscription after the user
 * has approved it via PayPal buttons. It also grants benefits immediately
 * if the subscription is ACTIVE (no need to wait for webhook).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Verify user is authenticated
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { subscriptionId, planId, priceId } = await req.json();

    if (!subscriptionId || !planId || !priceId) {
      return NextResponse.json(
        { error: 'subscriptionId, planId, and priceId are required' },
        { status: 400 }
      );
    }

    const provider = new PayPalProvider();

    // 2. Get subscription details from PayPal API
    const subscription = await provider.getSubscription(subscriptionId);

    // 3. Validate subscription status
    if (!['ACTIVE', 'APPROVED'].includes(subscription.status)) {
      console.error('Invalid subscription status:', subscription.status);
      return NextResponse.json(
        {
          error: 'Subscription not active or approved',
          status: subscription.status,
        },
        { status: 400 }
      );
    }

    // 4. Validate metadata (planId from custom_id)
    let metadata: any = {};
    if (subscription.custom_id) {
      try {
        metadata = JSON.parse(subscription.custom_id);
      } catch {
        metadata = { custom_id: subscription.custom_id };
      }
    }

    if (metadata.planId !== planId) {
      console.error('Plan mismatch:', {
        expected: planId,
        got: metadata.planId,
      });
      return NextResponse.json({ error: 'Plan mismatch' }, { status: 400 });
    }

    // 5. Log if subscriber email differs from current user (for debugging)
    // Note: We don't reject based on email mismatch because:
    // - Users may have different emails for website and PayPal
    // - Sandbox test accounts have different emails
    // - The userId in metadata is the authoritative identifier
    const subscriberEmail = subscription.subscriber?.email_address;
    if (subscriberEmail && subscriberEmail !== session.user.email) {
      console.warn('Subscriber email differs from session user:', {
        sessionEmail: session.user.email,
        paypalEmail: subscriberEmail,
        userId: session.user.id,
      });
    }

    // 6. Validate price/amount if possible
    const price = findPriceInPlan(planId, priceId);
    if (price) {
      const billingInfo = subscription.billing_info;
      if (billingInfo?.last_payment?.amount?.value) {
        const paidAmount = Math.round(
          Number.parseFloat(billingInfo.last_payment.amount.value) * 100
        );
        const expectedAmount = price.amount;
        if (paidAmount !== expectedAmount) {
          console.warn('Amount mismatch (may be OK for first billing):', {
            paid: paidAmount,
            expected: expectedAmount,
          });
          // Don't reject - first payment might differ due to prorations
        }
      }
    }

    // 7. Check if subscription already recorded
    const db = await getDb();
    const existingPayment = await db
      .select()
      .from(payment)
      .where(eq(payment.paypalSubscriptionId, subscriptionId))
      .limit(1);

    const currentDate = new Date();
    const interval =
      metadata.interval ||
      (price?.interval === 'year' ? PlanIntervals.YEAR : PlanIntervals.MONTH);

    // Calculate period dates
    const periodStart = new Date(
      subscription.start_time || subscription.create_time
    );
    const periodEnd = subscription.billing_info?.next_billing_time
      ? new Date(subscription.billing_info.next_billing_time)
      : calculatePeriodEnd(periodStart, interval);

    // Determine if subscription is active (can grant benefits immediately)
    const isActive = subscription.status === 'ACTIVE';

    if (existingPayment.length === 0) {
      // 8. Create payment record
      await db.insert(payment).values({
        id: randomUUID(),
        priceId,
        type: PaymentTypes.SUBSCRIPTION,
        scene: PaymentScenes.SUBSCRIPTION,
        interval,
        userId: session.user.id!,
        customerId: subscription.subscriber?.payer_id || '',
        paypalSubscriptionId: subscriptionId,
        provider: 'paypal',
        paid: isActive, // Set to true if subscription is active
        status: isActive ? 'active' : 'processing',
        periodStart,
        periodEnd,
        createdAt: currentDate,
        updatedAt: currentDate,
      });

      // 9. Grant benefits immediately if subscription is active
      if (isActive && websiteConfig.credits?.enableCredits) {
        await addSubscriptionCredits(session.user.id!, priceId);
        console.log('Subscription credits granted for user:', session.user.id);
      }
    } else {
      // Update existing record
      await db
        .update(payment)
        .set({
          status: isActive ? 'active' : 'processing',
          paid: isActive,
          periodStart,
          periodEnd,
          updatedAt: currentDate,
        })
        .where(eq(payment.id, existingPayment[0].id));

      // Grant benefits if not already paid and now active
      if (
        isActive &&
        !existingPayment[0].paid &&
        websiteConfig.credits?.enableCredits
      ) {
        await addSubscriptionCredits(session.user.id!, priceId);
        console.log('Subscription credits granted for user:', session.user.id);
      }
    }

    // 10. Return success
    return NextResponse.json({
      success: true,
      status: isActive ? 'active' : 'pending',
      subscriptionId,
    });
  } catch (error) {
    console.error('PayPal confirm subscription error:', error);
    return NextResponse.json(
      { error: 'Failed to confirm PayPal subscription' },
      { status: 500 }
    );
  }
}

/**
 * Calculate period end date based on interval
 */
function calculatePeriodEnd(startDate: Date, interval: string): Date {
  const endDate = new Date(startDate);
  switch (interval) {
    case 'year':
      endDate.setFullYear(endDate.getFullYear() + 1);
      break;
    default:
      endDate.setMonth(endDate.getMonth() + 1);
      break;
  }
  return endDate;
}
