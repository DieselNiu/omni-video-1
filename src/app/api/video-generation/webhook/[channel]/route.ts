import { type NextRequest, NextResponse } from 'next/server';
import {
  handleWebhookResult,
  parseMaxApiWebhook,
} from '../lib/webhook-handlers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;
  console.log('[Video Webhook] ========== Incoming Request ==========');
  console.log(
    `[Video Webhook] Time: ${new Date().toISOString()}, Channel: ${channel}`
  );

  try {
    const body = await request.json();
    console.log('[Video Webhook] Body:', JSON.stringify(body, null, 2));

    switch (channel) {
      case 'maxapi': {
        const parsed = parseMaxApiWebhook(body);
        if (!parsed) {
          console.error(
            '[Video Webhook] Invalid MaxAPI webhook data: no taskId'
          );
          return NextResponse.json(
            { error: 'Invalid webhook data' },
            { status: 400 }
          );
        }
        return handleWebhookResult(parsed);
      }
      default:
        console.error(`[Video Webhook] Unknown channel: ${channel}`);
        return NextResponse.json(
          { error: `Unknown channel: ${channel}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Video Webhook] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
