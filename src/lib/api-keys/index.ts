import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { getDb } from '@/db';
import { apiKey, payment } from '@/db/schema';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

/**
 * Plaintext key shape: sk-gi2-<32 hex chars> (total 39 chars).
 *
 * The plaintext is returned to the user exactly once at creation time; the DB
 * only stores:
 *   - sha256(plaintext) as `key_hash` (unique, timing-safe comparison)
 *   - the first 12 chars as `key_prefix` (for list display and index lookup)
 */
export const API_KEY_PREFIX = 'sk-gi2-';
export const API_KEY_DISPLAY_PREFIX_LEN = 12;

/** Payment scenes that count as "paid user" for API-key creation eligibility. */
const PAID_PAYMENT_SCENES = ['credit', 'lifetime', 'subscription'];

export class ApiKeyError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ApiKeyError';
    this.code = code;
    this.status = status;
  }
}

/** Generate a fresh plaintext key. */
export function generatePlaintextKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(16).toString('hex')}`;
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export function extractDisplayPrefix(plaintext: string): string {
  return plaintext.slice(0, API_KEY_DISPLAY_PREFIX_LEN);
}

/**
 * Check whether a user has any completed payment on record. This gates API-key
 * creation — free/gift/check-in credits alone do not qualify.
 */
export async function userHasPaidHistory(userId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: payment.id })
    .from(payment)
    .where(
      and(
        eq(payment.userId, userId),
        eq(payment.paid, true),
        inArray(payment.scene, PAID_PAYMENT_SCENES)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export interface CreatedApiKey {
  id: string;
  name: string;
  plaintext: string;
  keyPrefix: string;
  createdAt: Date;
}

/** Create a new API key for a user. Returns the plaintext ONCE. */
export async function createApiKey(params: {
  userId: string;
  name: string;
}): Promise<CreatedApiKey> {
  const name = params.name.trim();
  if (!name) {
    throw new ApiKeyError('INVALID_NAME', 'Name is required', 400);
  }
  if (name.length > 100) {
    throw new ApiKeyError('INVALID_NAME', 'Name is too long (max 100)', 400);
  }

  const paid = await userHasPaidHistory(params.userId);
  if (!paid) {
    throw new ApiKeyError(
      'PAID_HISTORY_REQUIRED',
      'API access requires at least one completed purchase. Please buy a credit package to enable API access.',
      403
    );
  }

  const plaintext = generatePlaintextKey();
  const keyHash = hashApiKey(plaintext);
  const keyPrefix = extractDisplayPrefix(plaintext);
  const id = crypto.randomUUID();
  const now = new Date();

  const db = await getDb();
  await db.insert(apiKey).values({
    id,
    userId: params.userId,
    name,
    keyHash,
    keyPrefix,
    createdAt: now,
  });

  return { id, name, plaintext, keyPrefix, createdAt: now };
}

export async function listApiKeys(userId: string) {
  const db = await getDb();
  return db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      lastUsedAt: apiKey.lastUsedAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
    })
    .from(apiKey)
    .where(eq(apiKey.userId, userId))
    .orderBy(desc(apiKey.createdAt));
}

/** Revoke a key. No-op if already revoked or not owned by user. */
export async function revokeApiKey(params: {
  userId: string;
  keyId: string;
}): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKey.id, params.keyId),
        eq(apiKey.userId, params.userId),
        isNull(apiKey.revokedAt)
      )
    )
    .returning({ id: apiKey.id });
  return result.length > 0;
}

export interface ValidatedApiKey {
  id: string;
  userId: string;
  keyPrefix: string;
}

/**
 * Validate an incoming plaintext key.
 *
 * Lookup uses sha256 hash (indexed, unique), then a timing-safe comparison
 * re-verifies the hash byte-equality. Revoked keys are rejected.
 */
export async function validateApiKey(
  plaintext: string
): Promise<ValidatedApiKey | null> {
  if (!plaintext.startsWith(API_KEY_PREFIX)) {
    return null;
  }
  if (plaintext.length !== API_KEY_PREFIX.length + 32) {
    return null;
  }

  const keyHash = hashApiKey(plaintext);
  const db = await getDb();
  const rows = await db
    .select({
      id: apiKey.id,
      userId: apiKey.userId,
      keyHash: apiKey.keyHash,
      keyPrefix: apiKey.keyPrefix,
      revokedAt: apiKey.revokedAt,
    })
    .from(apiKey)
    .where(eq(apiKey.keyHash, keyHash))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.revokedAt) return null;

  // Redundant timing-safe check in case of a hash collision vector.
  const a = Buffer.from(keyHash);
  const b = Buffer.from(row.keyHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  return { id: row.id, userId: row.userId, keyPrefix: row.keyPrefix };
}

/** Fire-and-forget update of last-used timestamp. Errors swallowed by caller. */
export async function markApiKeyUsed(keyId: string) {
  const db = await getDb();
  await db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, keyId));
}

/** Parse `Authorization: Bearer <key>` header. Returns plaintext or null. */
export function parseBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1]?.trim() || null;
}
