import { handleWebhookEvent } from '@/payment';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * NOWPayments IPN webhook handler.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const payload = await req.text();
  const signature = req.headers.get('x-nowpayments-sig') || '';

  try {
    if (!payload) {
      return NextResponse.json(
        { error: 'Missing webhook payload' },
        { status: 400 }
      );
    }

    await handleWebhookEvent(payload, signature, 'nowpayments');

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Error in NOWPayments webhook route:', error);

    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    );
  }
}
