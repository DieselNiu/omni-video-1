import { getDb } from '@/db';
import { rateLimitCounter } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import type { UploadIntentRateLimit } from './intents';

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  windowStart: Date;
}

function floorToWindowStart(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

export function computeWindowStart(now: Date, windowSeconds: number): Date {
  return floorToWindowStart(now, windowSeconds);
}

/**
 * Read the current counter value for (subject, intent, window) without
 * mutating it. Returns 0 if no row exists yet. Used to decide whether
 * a captcha challenge is needed *before* we atomically increment, so
 * a 428 response does not consume a slot.
 *
 * There is a race between peek and the subsequent increment, but the
 * hard cap (`max`) is still enforced atomically, so the worst case is
 * a small number of concurrent requests from the same subject slipping
 * past the soft threshold — they are still bounded by `max`.
 */
export async function peekRateLimitCount(params: {
  subjectKey: string;
  intent: string;
  windowSeconds: number;
  now?: Date;
}): Promise<{ count: number; windowStart: Date; windowEnd: number }> {
  const db = await getDb();
  const now = params.now ?? new Date();
  const windowStart = floorToWindowStart(now, params.windowSeconds);
  const windowEnd = windowStart.getTime() + params.windowSeconds * 1000;

  const rows = await db
    .select({ count: rateLimitCounter.count })
    .from(rateLimitCounter)
    .where(
      and(
        eq(rateLimitCounter.subjectKey, params.subjectKey),
        eq(rateLimitCounter.intent, params.intent),
        eq(rateLimitCounter.windowStart, windowStart)
      )
    )
    .limit(1);

  return { count: rows[0]?.count ?? 0, windowStart, windowEnd };
}

/**
 * Atomically increment the counter for (subjectKey, intent, windowStart).
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE with RETURNING so concurrent
 * requests from the same subject cannot race past the limit. If the
 * resulting count exceeds `max`, the request is rejected but the
 * counter stays incremented — sustained abuse keeps the window
 * full until it rolls over, which is the desired behavior.
 */
export async function checkAndIncrementRateLimit(params: {
  subjectKey: string;
  intent: string;
  limit: Pick<UploadIntentRateLimit, 'windowSeconds' | 'max'>;
  now?: Date;
}): Promise<RateLimitDecision> {
  const db = await getDb();
  const now = params.now ?? new Date();
  const windowStart = floorToWindowStart(now, params.limit.windowSeconds);

  const inserted = await db
    .insert(rateLimitCounter)
    .values({
      id: crypto.randomUUID(),
      subjectKey: params.subjectKey,
      intent: params.intent,
      windowStart,
      count: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        rateLimitCounter.subjectKey,
        rateLimitCounter.intent,
        rateLimitCounter.windowStart,
      ],
      set: {
        count: sql`${rateLimitCounter.count} + 1`,
        updatedAt: now,
      },
    })
    .returning({ count: rateLimitCounter.count });

  const count = inserted[0]?.count ?? 1;
  const max = params.limit.max;
  const allowed = count <= max;
  const windowEndMs = windowStart.getTime() + params.limit.windowSeconds * 1000;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowEndMs - now.getTime()) / 1000)
  );

  return {
    allowed,
    limit: max,
    remaining: Math.max(0, max - count),
    retryAfterSeconds,
    windowStart,
  };
}
