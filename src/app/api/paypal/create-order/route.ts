import { auth } from '@/lib/auth';
import { PayPalProvider } from '@/payment/provider/paypal';
import type { CheckoutResult } from '@/payment/types';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Create PayPal order for one-time payment
 *
 * This endpoint creates a PayPal order that can be approved by the user
 * via PayPal buttons on the frontend.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Verify user is authenticated
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { planId, priceId, packageId, type } = await req.json();

    if (!priceId) {
      return NextResponse.json(
        { error: 'priceId is required' },
        { status: 400 }
      );
    }

    const provider = new PayPalProvider();

    // Determine success/cancel URLs - reuse existing /payment page
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    const callbackUrl = packageId ? '/settings/credits' : '/settings/billing';
    const successUrl = `${baseUrl}/payment?callback=${callbackUrl}`;
    const cancelUrl = `${baseUrl}/pricing`;

    const result: CheckoutResult =
      type === 'credit_purchase' && packageId
        ? await provider.createCreditCheckout({
            packageId,
            priceId,
            customerEmail: session.user.email!,
            successUrl,
            cancelUrl,
            metadata: {
              userId: session.user.id!,
              userName: session.user.name || '',
              type: 'credit_purchase',
            },
          })
        : await provider.createCheckout({
            planId: planId || '',
            priceId,
            customerEmail: session.user.email!,
            successUrl,
            cancelUrl,
            metadata: {
              userId: session.user.id!,
              userName: session.user.name || '',
            },
          });

    // For PayPal buttons, we return the order ID
    // The frontend will use this to render the PayPal approval flow
    return NextResponse.json({
      orderId: result.id,
      approvalUrl: result.url,
    });
  } catch (error) {
    console.error('PayPal create order error:', error);
    return NextResponse.json(
      { error: 'Failed to create PayPal order' },
      { status: 500 }
    );
  }
}
