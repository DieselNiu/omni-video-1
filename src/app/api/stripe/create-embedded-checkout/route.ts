import { auth } from '@/lib/auth';
import { StripeProvider } from '@/payment/provider/stripe';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Create Stripe Embedded Checkout session
 *
 * This endpoint creates a Stripe checkout session with ui_mode='embedded'
 * and returns the client_secret for mounting the embedded checkout component.
 *
 * NOTE: This route requires the StripeProvider to have createEmbeddedCheckout
 * and createEmbeddedCreditCheckout methods, as well as the following types
 * in payment/types.ts:
 * - EmbeddedCheckoutResult
 * - CreateEmbeddedCheckoutParams
 * - CreateEmbeddedCreditCheckoutParams
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

    const provider = new StripeProvider() as any;

    // Determine return URL - reuse the existing /payment page
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    const callbackUrl = packageId ? '/settings/credits' : '/settings/billing';
    const returnUrl = `${baseUrl}/payment?session_id={CHECKOUT_SESSION_ID}&callback=${callbackUrl}`;

    const result =
      type === 'credit_purchase' && packageId
        ? await provider.createEmbeddedCreditCheckout({
            packageId,
            priceId,
            customerEmail: session.user.email!,
            returnUrl,
            metadata: {
              userId: session.user.id!,
              userName: session.user.name || '',
              type: 'credit_purchase',
            },
          })
        : await (async () => {
            if (!planId) {
              throw new Error('planId is required for plan purchases');
            }

            return provider.createEmbeddedCheckout({
              planId,
              priceId,
              customerEmail: session.user.email!,
              returnUrl,
              metadata: {
                userId: session.user.id!,
                userName: session.user.name || '',
              },
            });
          })();

    return NextResponse.json({
      clientSecret: result.clientSecret,
      sessionId: result.sessionId,
    });
  } catch (error) {
    console.error('Stripe create embedded checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create Stripe embedded checkout' },
      { status: 500 }
    );
  }
}
