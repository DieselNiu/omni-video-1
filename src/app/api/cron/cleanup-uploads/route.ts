import { cleanupTemporaryUploads } from '@/storage/cleanup';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const header = request.headers.get('authorization');
  if (!header) {
    return false;
  }

  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = await cleanupTemporaryUploads();
  return NextResponse.json({ ok: true, results });
}

export const maxDuration = 300;
