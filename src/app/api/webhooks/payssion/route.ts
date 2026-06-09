import { handleWebhookEvent } from '@/payment';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Payssion async notification (notify_url) handler.
 *
 * The signature (notify_sig) is carried inside the request body, so we pass an
 * empty signature string and let the provider verify it from the payload.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const payload = await req.text();

  try {
    if (!payload) {
      return NextResponse.json(
        { error: 'Missing webhook payload' },
        { status: 400 }
      );
    }

    await handleWebhookEvent(payload, '', 'payssion');

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Error in Payssion webhook route:', error);

    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    );
  }
}
