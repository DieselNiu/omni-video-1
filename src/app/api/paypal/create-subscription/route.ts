import { auth } from '@/lib/auth';
import { PayPalProvider } from '@/payment/provider/paypal';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Create PayPal subscription
 *
 * This endpoint creates a PayPal subscription that can be approved by the user
 * via PayPal buttons on the frontend.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Verify user is authenticated
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { planId, priceId } = await req.json();

    if (!planId || !priceId) {
      return NextResponse.json(
        { error: 'planId and priceId are required' },
        { status: 400 }
      );
    }

    const provider = new PayPalProvider();

    // Determine success/cancel URLs - reuse existing /payment page
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    const successUrl = `${baseUrl}/payment?callback=/settings/billing`;
    const cancelUrl = `${baseUrl}/pricing`;

    // Create subscription checkout
    const result = await provider.createCheckout({
      planId,
      priceId,
      customerEmail: session.user.email!,
      successUrl,
      cancelUrl,
      metadata: {
        userId: session.user.id!,
        userName: session.user.name || '',
      },
    });

    // For PayPal subscriptions, we return the subscription ID
    // The frontend will use this to render the PayPal approval flow
    return NextResponse.json({
      subscriptionId: result.id,
      approvalUrl: result.url,
    });
  } catch (error) {
    console.error('PayPal create subscription error:', error);
    return NextResponse.json(
      { error: 'Failed to create PayPal subscription' },
      { status: 500 }
    );
  }
}
