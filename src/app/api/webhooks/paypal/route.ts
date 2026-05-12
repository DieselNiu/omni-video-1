import { PayPalProvider } from '@/payment/provider/paypal';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * PayPal webhook handler
 * This endpoint receives webhook events from PayPal and processes them
 *
 * PayPal webhook events reference:
 * https://developer.paypal.com/docs/api-basics/notifications/webhooks/event-names/
 *
 * @param req The incoming request
 * @returns NextResponse
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Get the request body as text
  const payload = await req.text();

  // Get PayPal signature headers
  const headers = {
    'paypal-auth-algo': req.headers.get('paypal-auth-algo'),
    'paypal-cert-url': req.headers.get('paypal-cert-url'),
    'paypal-transmission-id': req.headers.get('paypal-transmission-id'),
    'paypal-transmission-sig': req.headers.get('paypal-transmission-sig'),
    'paypal-transmission-time': req.headers.get('paypal-transmission-time'),
  };

  try {
    // Validate inputs
    if (!payload) {
      return NextResponse.json(
        { error: 'Missing webhook payload' },
        { status: 400 }
      );
    }

    // Process the webhook event with PayPal provider
    const provider = new PayPalProvider();
    await provider.handleWebhookEvent(payload, JSON.stringify(headers));

    // Return success
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Error in PayPal webhook route:', error);

    // Return error
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    );
  }
}
