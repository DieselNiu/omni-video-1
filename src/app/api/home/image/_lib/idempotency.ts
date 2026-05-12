import { getDb } from '@/db';
import { homeIdempotency } from '@/db/schema';
import { sha256Hex } from '@/lib/home-image-security';
import { and, eq } from 'drizzle-orm';
import { HOME_IMAGE_IDEMPOTENCY_STATUS } from './constants';

const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 60;

type HomeIdempotencyRecord = typeof homeIdempotency.$inferSelect;

function getIdempotencyTtlSeconds() {
  const rawValue = process.env.HOME_IDEMPOTENCY_TTL_SECONDS;
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_IDEMPOTENCY_TTL_SECONDS;
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)])
    );
  }

  return value;
}

export async function hashCanonicalJson(value: unknown) {
  return sha256Hex(JSON.stringify(sortJsonValue(value)));
}

export type ReserveHomeIdempotencyResult =
  | {
      kind: 'created';
      record: HomeIdempotencyRecord;
    }
  | {
      kind: 'payload-conflict';
      record: HomeIdempotencyRecord;
    }
  | {
      kind: 'in-progress';
      record: HomeIdempotencyRecord;
    }
  | {
      kind: 'replay';
      record: HomeIdempotencyRecord;
    };

export async function reserveHomeIdempotency(params: {
  subjectKey: string;
  idempotencyKey: string;
  requestHash: string;
  now?: Date;
}): Promise<ReserveHomeIdempotencyResult> {
  const db = await getDb();
  const now = params.now ? new Date(params.now) : new Date();

  const insertedRows = await db
    .insert(homeIdempotency)
    .values({
      id: crypto.randomUUID(),
      subjectKey: params.subjectKey,
      idempotencyKey: params.idempotencyKey,
      status: HOME_IMAGE_IDEMPOTENCY_STATUS.PENDING,
      requestHash: params.requestHash,
      createdAt: now,
      updatedAt: now,
      expiresAt: addSeconds(now, getIdempotencyTtlSeconds()),
    })
    .onConflictDoNothing({
      target: [homeIdempotency.subjectKey, homeIdempotency.idempotencyKey],
    })
    .returning();

  if (insertedRows[0]) {
    return {
      kind: 'created',
      record: insertedRows[0],
    };
  }

  const existingRows = await db
    .select()
    .from(homeIdempotency)
    .where(
      and(
        eq(homeIdempotency.subjectKey, params.subjectKey),
        eq(homeIdempotency.idempotencyKey, params.idempotencyKey)
      )
    )
    .limit(1);

  const existingRecord = existingRows[0];
  if (!existingRecord) {
    throw new Error('Idempotency reserve failed without a readable record.');
  }

  if (existingRecord.requestHash !== params.requestHash) {
    return {
      kind: 'payload-conflict',
      record: existingRecord,
    };
  }

  if (existingRecord.status === HOME_IMAGE_IDEMPOTENCY_STATUS.PENDING) {
    return {
      kind: 'in-progress',
      record: existingRecord,
    };
  }

  return {
    kind: 'replay',
    record: existingRecord,
  };
}

export async function finalizeHomeIdempotencySuccess(params: {
  recordId: string;
  responseCode: number;
  responseBody: unknown;
  generationKind: string;
  generationId: string;
  providerRequestId: string | null;
  now?: Date;
}) {
  const db = await getDb();
  const now = params.now ? new Date(params.now) : new Date();

  await db
    .update(homeIdempotency)
    .set({
      status: HOME_IMAGE_IDEMPOTENCY_STATUS.SUCCEEDED,
      responseCode: params.responseCode,
      responseBody: params.responseBody,
      generationKind: params.generationKind,
      generationId: params.generationId,
      providerRequestId: params.providerRequestId,
      updatedAt: now,
    })
    .where(eq(homeIdempotency.id, params.recordId));
}

export async function finalizeHomeIdempotencyFailure(params: {
  recordId: string;
  responseCode: number;
  responseBody: unknown;
  generationKind?: string | null;
  generationId?: string | null;
  providerRequestId?: string | null;
  now?: Date;
}) {
  const db = await getDb();
  const now = params.now ? new Date(params.now) : new Date();

  await db
    .update(homeIdempotency)
    .set({
      status: HOME_IMAGE_IDEMPOTENCY_STATUS.FAILED,
      responseCode: params.responseCode,
      responseBody: params.responseBody,
      generationKind: params.generationKind ?? null,
      generationId: params.generationId ?? null,
      providerRequestId: params.providerRequestId ?? null,
      updatedAt: now,
    })
    .where(eq(homeIdempotency.id, params.recordId));
}
