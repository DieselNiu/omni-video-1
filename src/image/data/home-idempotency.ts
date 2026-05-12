import { randomUUID } from 'crypto';
import { getDb } from '@/db';
import { homeIdempotency } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';

export type HomeIdempotencyStatus = 'pending' | 'succeeded' | 'failed';

export interface HomeIdempotencyRecord {
  id: string;
  subjectKey: string;
  idempotencyKey: string;
  status: HomeIdempotencyStatus;
  requestHash: string;
  responseCode: number | null;
  responseBody: Record<string, unknown> | null;
  generationKind: string | null;
  generationId: string | null;
  providerRequestId: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

function mapDbRowToHomeIdempotency(
  row: typeof homeIdempotency.$inferSelect
): HomeIdempotencyRecord {
  return {
    id: row.id,
    subjectKey: row.subjectKey,
    idempotencyKey: row.idempotencyKey,
    status: row.status as HomeIdempotencyStatus,
    requestHash: row.requestHash,
    responseCode: row.responseCode,
    responseBody: (row.responseBody as Record<string, unknown> | null) ?? null,
    generationKind: row.generationKind,
    generationId: row.generationId,
    providerRequestId: row.providerRequestId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
  };
}

export async function reserveHomeIdempotency(params: {
  subjectKey: string;
  idempotencyKey: string;
  requestHash: string;
  expiresAt: Date;
}) {
  const db = await getDb();
  const now = new Date();
  const inserted = await db
    .insert(homeIdempotency)
    .values({
      id: randomUUID(),
      subjectKey: params.subjectKey,
      idempotencyKey: params.idempotencyKey,
      status: 'pending',
      requestHash: params.requestHash,
      createdAt: now,
      updatedAt: now,
      expiresAt: params.expiresAt,
    })
    .onConflictDoNothing({
      target: [homeIdempotency.subjectKey, homeIdempotency.idempotencyKey],
    })
    .returning();

  if (inserted[0]) {
    return {
      created: true,
      record: mapDbRowToHomeIdempotency(inserted[0]),
    };
  }

  const existing = await db
    .select()
    .from(homeIdempotency)
    .where(
      and(
        eq(homeIdempotency.subjectKey, params.subjectKey),
        eq(homeIdempotency.idempotencyKey, params.idempotencyKey)
      )
    )
    .limit(1);

  return {
    created: false,
    record: existing[0] ? mapDbRowToHomeIdempotency(existing[0]) : null,
  };
}

export async function markHomeIdempotencyResult(params: {
  subjectKey: string;
  idempotencyKey: string;
  status: HomeIdempotencyStatus;
  responseCode: number;
  responseBody: Record<string, unknown>;
  generationKind?: string | null;
  generationId?: string | null;
  providerRequestId?: string | null;
}) {
  const db = await getDb();
  await db
    .update(homeIdempotency)
    .set({
      status: params.status,
      responseCode: params.responseCode,
      responseBody: params.responseBody,
      generationKind: params.generationKind ?? null,
      generationId: params.generationId ?? null,
      providerRequestId: params.providerRequestId ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(homeIdempotency.subjectKey, params.subjectKey),
        eq(homeIdempotency.idempotencyKey, params.idempotencyKey)
      )
    );
}

export async function clearExpiredHomeIdempotency() {
  const db = await getDb();
  await db
    .delete(homeIdempotency)
    .where(sql`${homeIdempotency.expiresAt} < now()`);
}
