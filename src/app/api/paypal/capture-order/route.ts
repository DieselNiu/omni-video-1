import { randomUUID } from 'crypto';
import { addCredits, addLifetimeMonthlyCredits } from '@/credits/credits';
import { getCreditPackageById } from '@/credits/server';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { auth } from '@/lib/auth';
import { PayPalProvider } from '@/payment/provider/paypal';
import { PaymentScenes, PaymentTypes } from '@/payment/types';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

function parseMetadata(customId: string | undefined): Record<string, string> {
  if (!customId) return {};
  try {
    return JSON.parse(customId);
  } catch {
    return { custom_id: customId };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId is required' },
        { status: 400 }
      );
    }

    const provider = new PayPalProvider();
    const captureResult = await provider.captureOrder(orderId);

    if (captureResult.status !== 'COMPLETED') {
      console.error('PayPal capture not completed:', captureResult.status);
      return NextResponse.json(
        { error: 'Payment capture failed', status: captureResult.status },
        { status: 400 }
      );
    }

    const capture = captureResult.purchase_units?.[0]?.payments?.captures?.[0];

    // The capture response may not include custom_id in purchase_units,
    // so fetch the full order details via GET to retrieve metadata reliably.
    const orderDetails = await provider.getOrderDetails(orderId);
    const purchaseUnit = orderDetails.purchase_units?.[0];
    const metadata = parseMetadata(purchaseUnit?.custom_id);

    const userId = session.user.id!;
    const priceId = metadata.priceId || '';
    const scene = metadata.scene || PaymentScenes.LIFETIME;
    const currentDate = new Date();

    const db = await getDb();
    await db.insert(payment).values({
      id: randomUUID(),
      priceId,
      type: PaymentTypes.ONE_TIME,
      scene,
      userId,
      customerId: captureResult.payer?.payer_id || '',
      paypalOrderId: orderId,
      provider: 'paypal',
      paid: true,
      status: 'completed',
      createdAt: currentDate,
      updatedAt: currentDate,
    });

    if (scene === PaymentScenes.CREDIT && metadata.packageId) {
      const creditPackage = getCreditPackageById(metadata.packageId);
      if (creditPackage) {
        await addCredits({
          userId,
          amount: creditPackage.amount,
          type: CREDIT_TRANSACTION_TYPE.PURCHASE_PACKAGE,
          description: `+${creditPackage.amount} credits for package ${metadata.packageId}`,
          paymentId: capture?.id || orderId,
          expireDays: creditPackage.expireDays,
        });
        console.log(
          'Credits granted for user:',
          userId,
          'amount:',
          creditPackage.amount
        );
      }
    } else if (scene === PaymentScenes.LIFETIME && priceId) {
      await addLifetimeMonthlyCredits(userId, priceId);
      console.log('Lifetime credits granted for user:', userId);
    }

    return NextResponse.json({
      success: true,
      status: captureResult.status,
      captureId: capture?.id,
      orderId: captureResult.id,
    });
  } catch (error) {
    console.error('PayPal capture order error:', error);
    return NextResponse.json(
      { error: 'Failed to capture PayPal order' },
      { status: 500 }
    );
  }
}
