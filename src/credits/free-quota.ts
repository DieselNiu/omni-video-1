import { randomUUID } from 'crypto';
import { websiteConfig } from '@/config/website';
import { getDb } from '@/db';
import { guestGeneration, quotaBucket } from '@/db/schema';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

/**
 * NOTE — name is a historical misnomer.
 *
 * `USER_FREE_10MIN` is a LEGACY name. The actual cooldown is controlled by
 * DEFAULT_USER_COOLDOWN_MINUTES (currently 60 minutes), not 10. The constant
 * key and its serialized string value are both kept as-is because existing
 * `quota_bucket.policy` rows in production store this exact string — renaming
 * in code without a DB backfill migration would cause every existing
 * logged-in user to get the anon code path on their next quota-exhausted
 * request (login modal instead of cooldown countdown).
 *
 * Proper rename (constant + string value + `UPDATE quota_bucket ...` migration)
 * is tracked in TODOS.md. Treat this name as opaque until then.
 */
export const FREE_QUOTA_POLICY = {
  ANON_ONE_SHOT: 'ANON_ONE_SHOT',
  USER_FREE_10MIN: 'USER_FREE_10MIN',
} as const;

export type FreeQuotaPolicy =
  (typeof FREE_QUOTA_POLICY)[keyof typeof FREE_QUOTA_POLICY];
export type FreeQuotaSubjectType = 'guest' | 'user';
export const FREE_QUOTA_SUBJECT_TYPE = {
  GUEST: 'guest',
  USER: 'user',
} as const;

export const FREE_QUOTA_ERROR = {
  ANON_QUOTA_EXHAUSTED: 'ANON_QUOTA_EXHAUSTED',
  USER_QUOTA_EXHAUSTED: 'USER_QUOTA_EXHAUSTED',
  ANON_BUCKET_LINKED_LOGIN_REQUIRED: 'ANON_BUCKET_LINKED_LOGIN_REQUIRED',
} as const;
export const FREE_QUOTA_ERROR_CODE = FREE_QUOTA_ERROR;

export type FreeQuotaErrorCode =
  (typeof FREE_QUOTA_ERROR)[keyof typeof FREE_QUOTA_ERROR];

export class FreeQuotaError extends Error {
  code: FreeQuotaErrorCode;
  nextRefillAt?: Date | null;

  constructor(code: FreeQuotaErrorCode, nextRefillAt?: Date | null) {
    super(code);
    this.code = code;
    this.nextRefillAt = nextRefillAt ?? null;
  }
}

export interface AbuseBinding {
  abuseBindKey: string;
  ipPrefixHash: string | null;
  uaHash: string | null;
  locale: string;
  visitorIdRiskSignal: string | null;
  degraded: boolean;
}
export type DerivedAbuseBindKey = AbuseBinding;

export interface FreeQuotaState {
  subjectType: FreeQuotaSubjectType;
  remaining: number;
  capacity: number;
  policy: FreeQuotaPolicy;
  nextRefillAt: Date | null;
  exhausted: boolean;
  degraded: boolean;
  linkedLoginRequired: boolean;
}

const ABUSE_BIND_SEPARATOR = '\x1F';

type QuotaBucketRecord = typeof quotaBucket.$inferSelect;
type QuotaDbExecutor = any;
type QuotaBucketRawRow = {
  id: string;
  subjectType: string;
  subjectId: string;
  ipPrefixHash: string | null;
  uaHash: string | null;
  locale: string | null;
  visitorIdRiskSignal: string | null;
  remaining: number;
  capacity: number;
  policy: string;
  nextRefillAt: Date | string | null;
  exhaustedAt: Date | string | null;
  linkedUserId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function getFreeQuotaCapacity(subjectType: FreeQuotaSubjectType) {
  return subjectType === 'user'
    ? websiteConfig.credits.userFreeRequests
    : websiteConfig.credits.guestFreeRequests;
}

function getUserCooldownMinutes() {
  return websiteConfig.credits.userRefillMinutes;
}

function parseQuotaTimestamp(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const withTimezone = /Z$/i.test(normalized)
    ? normalized
    : /[+-]\d{2}:\d{2}$/i.test(normalized)
      ? normalized
      : /[+-]\d{4}$/i.test(normalized)
        ? `${normalized.slice(0, -5)}${normalized.slice(-5, -2)}:${normalized.slice(-2)}`
        : /[+-]\d{2}$/i.test(normalized)
          ? `${normalized}:00`
          : `${normalized}Z`;
  const parsed = new Date(withTimezone);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseQuotaTimestampRequired(
  value: Date | string | null | undefined,
  field: string
) {
  const parsed = parseQuotaTimestamp(value);
  if (!parsed) {
    throw new Error(`Invalid quota bucket timestamp for ${field}`);
  }
  return parsed;
}

function hydrateQuotaBucketRecord(
  row: QuotaBucketRawRow | null | undefined
): QuotaBucketRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    ipPrefixHash: row.ipPrefixHash,
    uaHash: row.uaHash,
    locale: row.locale,
    visitorIdRiskSignal: row.visitorIdRiskSignal,
    remaining: Number(row.remaining),
    capacity: Number(row.capacity),
    policy: row.policy,
    nextRefillAt: parseQuotaTimestamp(row.nextRefillAt),
    exhaustedAt: parseQuotaTimestamp(row.exhaustedAt),
    linkedUserId: row.linkedUserId,
    createdAt: parseQuotaTimestampRequired(row.createdAt, 'createdAt'),
    updatedAt: parseQuotaTimestampRequired(row.updatedAt, 'updatedAt'),
  };
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getAbuseBindSecret() {
  const secret = process.env.ABUSE_BIND_SECRET;
  if (!secret) {
    throw new Error('ABUSE_BIND_SECRET is required');
  }
  return secret;
}

function getForwardedIp(headers: Headers): string | null {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return null;
}

function normalizeIpv4(ip: string): string | null {
  const sanitized = ip.replace(/:\d+$/, '');
  const octets = sanitized.split('.');
  if (octets.length !== 4) {
    return null;
  }

  const normalized = octets.map((part) => Number.parseInt(part, 10));
  if (normalized.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }

  return normalized.join('.');
}

function expandIpv6(ip: string): string[] | null {
  const withoutZone = ip.split('%')[0]?.toLowerCase() ?? ip.toLowerCase();
  const bare = withoutZone.replace(/^\[/, '').replace(/\]$/, '');
  const [head, tail] = bare.split('::');
  const headParts = head ? head.split(':').filter(Boolean) : [];
  const tailParts = tail ? tail.split(':').filter(Boolean) : [];

  if (headParts.length + tailParts.length > 8) {
    return null;
  }

  const missing = 8 - (headParts.length + tailParts.length);
  const expanded = [
    ...headParts,
    ...Array.from({ length: missing }, () => '0'),
    ...tailParts,
  ];

  if (expanded.length !== 8) {
    return null;
  }

  return expanded.map((part) => part.padStart(4, '0'));
}

function getIpPrefix(ip: string | null): string | null {
  if (!ip) {
    return null;
  }

  const ipv4 = normalizeIpv4(ip);
  if (ipv4) {
    const octets = ipv4.split('.');
    return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  }

  const ipv6 = expandIpv6(ip);
  if (!ipv6) {
    return null;
  }

  return `${ipv6.slice(0, 3).join(':')}::/48`;
}

function extractBrowserSignature(userAgent: string) {
  const patterns: Array<[RegExp, string]> = [
    [/EdgA?\/(\d+)/i, 'Edge'],
    [/CriOS\/(\d+)/i, 'Chrome'],
    [/Chrome\/(\d+)/i, 'Chrome'],
    [/FxiOS\/(\d+)/i, 'Firefox'],
    [/Firefox\/(\d+)/i, 'Firefox'],
    [/Version\/(\d+).+Safari/i, 'Safari'],
    [/Safari\/(\d+)/i, 'Safari'],
  ];

  for (const [pattern, family] of patterns) {
    const match = userAgent.match(pattern);
    if (match) {
      return `${family}/${match[1]}`;
    }
  }

  return 'Unknown/0';
}

function extractOsSignature(userAgent: string) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return 'iOS';
  }
  if (/Android/i.test(userAgent)) {
    return 'Android';
  }
  if (/Mac OS X|Macintosh/i.test(userAgent)) {
    return 'macOS';
  }
  if (/Windows NT/i.test(userAgent)) {
    return 'Windows';
  }
  if (/Linux/i.test(userAgent)) {
    return 'Linux';
  }
  return 'UnknownOS';
}

function normalizeUserAgentSignature(userAgent: string | null) {
  if (!userAgent) {
    return 'unknown-browser unknown-os';
  }

  return `${extractBrowserSignature(userAgent)} ${extractOsSignature(userAgent)}`;
}

function normalizeLocaleHeader(acceptLanguage: string | null) {
  const first = acceptLanguage?.split(',')[0]?.trim();
  if (!first) {
    return 'und';
  }

  const [language, region] = first.split('-');
  if (!region) {
    return language.toLowerCase();
  }

  return `${language.toLowerCase()}-${region.toUpperCase()}`;
}

async function digestHex(algorithm: 'SHA-256', value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest(algorithm, data);
  return toHex(digest);
}

async function hmacSha256Hex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value)
  );

  return toHex(signature);
}

function mapQuotaBucketToState(
  bucket: QuotaBucketRecord | null,
  subjectType: FreeQuotaSubjectType,
  degraded: boolean
): FreeQuotaState {
  const defaultPolicy =
    subjectType === 'guest'
      ? FREE_QUOTA_POLICY.ANON_ONE_SHOT
      : FREE_QUOTA_POLICY.USER_FREE_10MIN;

  if (!bucket) {
    return {
      subjectType,
      remaining: getFreeQuotaCapacity(subjectType),
      capacity: getFreeQuotaCapacity(subjectType),
      policy: defaultPolicy,
      nextRefillAt: null,
      exhausted: false,
      degraded,
      linkedLoginRequired: false,
    };
  }

  const linkedLoginRequired =
    bucket.subjectType === 'guest' && bucket.linkedUserId !== null;

  return {
    subjectType,
    remaining: linkedLoginRequired ? 0 : bucket.remaining,
    capacity: bucket.capacity,
    policy: bucket.policy as FreeQuotaPolicy,
    nextRefillAt: bucket.nextRefillAt,
    exhausted: linkedLoginRequired || bucket.remaining <= 0,
    degraded,
    linkedLoginRequired,
  };
}

async function selectQuotaBucketBySubject(params: {
  subjectType: FreeQuotaSubjectType;
  subjectId: string;
}) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(quotaBucket)
    .where(
      and(
        eq(quotaBucket.subjectType, params.subjectType),
        eq(quotaBucket.subjectId, params.subjectId)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

async function selectQuotaBucketForUpdate(tx: QuotaDbExecutor, id: string) {
  const rows = await tx.execute(sql<QuotaBucketRawRow>`
    select
      id,
      subject_type as "subjectType",
      subject_id as "subjectId",
      ip_prefix_hash as "ipPrefixHash",
      ua_hash as "uaHash",
      locale,
      visitor_id_risk_signal as "visitorIdRiskSignal",
      remaining,
      capacity,
      policy,
      next_refill_at as "nextRefillAt",
      exhausted_at as "exhaustedAt",
      linked_user_id as "linkedUserId",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from quota_bucket
    where id = ${id}
    for update
  `);

  return hydrateQuotaBucketRecord(rows[0]);
}

async function selectQuotaBucketBySubjectForUpdate(
  tx: QuotaDbExecutor,
  params: { subjectType: FreeQuotaSubjectType; subjectId: string }
) {
  const rows = await tx.execute(sql<QuotaBucketRawRow>`
    select
      id,
      subject_type as "subjectType",
      subject_id as "subjectId",
      ip_prefix_hash as "ipPrefixHash",
      ua_hash as "uaHash",
      locale,
      visitor_id_risk_signal as "visitorIdRiskSignal",
      remaining,
      capacity,
      policy,
      next_refill_at as "nextRefillAt",
      exhausted_at as "exhaustedAt",
      linked_user_id as "linkedUserId",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from quota_bucket
    where subject_type = ${params.subjectType}
      and subject_id = ${params.subjectId}
    for update
  `);

  return hydrateQuotaBucketRecord(rows[0]);
}

async function lookupOrCreateGuestBucket(
  tx: QuotaDbExecutor,
  binding: AbuseBinding
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await selectQuotaBucketBySubjectForUpdate(tx, {
      subjectType: 'guest',
      subjectId: binding.abuseBindKey,
    });

    if (existing) {
      return existing;
    }

    const inserted = await tx
      .insert(quotaBucket)
      .values({
        id: randomUUID(),
        subjectType: 'guest',
        subjectId: binding.abuseBindKey,
        ipPrefixHash: binding.ipPrefixHash,
        uaHash: binding.uaHash,
        locale: binding.locale,
        visitorIdRiskSignal: binding.visitorIdRiskSignal,
        remaining: getFreeQuotaCapacity('guest'),
        capacity: getFreeQuotaCapacity('guest'),
        policy: FREE_QUOTA_POLICY.ANON_ONE_SHOT,
      })
      .onConflictDoNothing({
        target: [quotaBucket.subjectType, quotaBucket.subjectId],
      })
      .returning();

    if (inserted[0]) {
      return inserted[0];
    }
  }

  throw new Error('Failed to create guest quota bucket after retries');
}

async function lookupOrCreateUserBucket(tx: QuotaDbExecutor, userId: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await selectQuotaBucketBySubjectForUpdate(tx, {
      subjectType: 'user',
      subjectId: userId,
    });

    if (existing) {
      return existing;
    }

    const inserted = await tx
      .insert(quotaBucket)
      .values({
        id: randomUUID(),
        subjectType: 'user',
        subjectId: userId,
        remaining: getFreeQuotaCapacity('user'),
        capacity: getFreeQuotaCapacity('user'),
        policy: FREE_QUOTA_POLICY.USER_FREE_10MIN,
      })
      .onConflictDoNothing({
        target: [quotaBucket.subjectType, quotaBucket.subjectId],
      })
      .returning();

    if (inserted[0]) {
      return inserted[0];
    }
  }

  throw new Error('Failed to create user quota bucket after retries');
}

async function lazyRefillBucket(
  tx: QuotaDbExecutor,
  bucket: QuotaBucketRecord
) {
  if (
    bucket.policy !== FREE_QUOTA_POLICY.USER_FREE_10MIN ||
    !bucket.nextRefillAt ||
    bucket.nextRefillAt.getTime() > Date.now()
  ) {
    return bucket;
  }

  const [updated] = await tx
    .update(quotaBucket)
    .set({
      remaining: bucket.capacity,
      nextRefillAt: null,
      exhaustedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(quotaBucket.id, bucket.id))
    .returning();

  return updated ?? bucket;
}

async function buildAbuseBinding(params: {
  ipAddress?: string | null;
  userAgent?: string | null;
  acceptLanguage?: string | null;
  visitorId?: string | null;
}): Promise<AbuseBinding> {
  const ipPrefix = getIpPrefix(params.ipAddress ?? null);
  const uaSignature = normalizeUserAgentSignature(params.userAgent ?? null);
  const locale = normalizeLocaleHeader(params.acceptLanguage ?? null);
  const degraded = !ipPrefix;
  const ipPrefixInput = ipPrefix ?? 'unknown';
  const input = [ipPrefixInput, uaSignature, locale].join(ABUSE_BIND_SEPARATOR);

  const abuseBindKey = await hmacSha256Hex(getAbuseBindSecret(), input);

  return {
    abuseBindKey,
    ipPrefixHash: ipPrefix ? await digestHex('SHA-256', ipPrefix) : null,
    uaHash: await digestHex('SHA-256', uaSignature),
    locale,
    visitorIdRiskSignal: params.visitorId ?? null,
    degraded,
  };
}

export async function deriveAbuseBinding(
  headers: Headers,
  visitorId?: string | null
): Promise<AbuseBinding> {
  return buildAbuseBinding({
    ipAddress: getForwardedIp(headers),
    userAgent: headers.get('user-agent'),
    acceptLanguage: headers.get('accept-language'),
    visitorId,
  });
}

export async function deriveAbuseBindKey(params: {
  ipAddress?: string | null;
  userAgent?: string | null;
  acceptLanguage?: string | null;
  visitorId?: string | null;
}): Promise<DerivedAbuseBindKey> {
  return buildAbuseBinding(params);
}

async function getFreeQuotaStateInternal(params: {
  subjectType: FreeQuotaSubjectType;
  userId?: string;
  abuseBinding?: AbuseBinding;
  createIfMissing?: boolean;
}) {
  const degraded = params.abuseBinding?.degraded ?? false;

  if (params.subjectType === 'guest') {
    if (!params.abuseBinding) {
      throw new Error('Guest quota state requires abuse binding');
    }

    if (!params.createIfMissing) {
      const existing = await selectQuotaBucketBySubject({
        subjectType: 'guest',
        subjectId: params.abuseBinding.abuseBindKey,
      });

      return {
        ...mapQuotaBucketToState(existing, 'guest', degraded),
        bucket: existing,
        errorCode:
          existing?.linkedUserId != null
            ? FREE_QUOTA_ERROR.ANON_BUCKET_LINKED_LOGIN_REQUIRED
            : existing && existing.remaining <= 0
              ? FREE_QUOTA_ERROR.ANON_QUOTA_EXHAUSTED
              : null,
      };
    }

    const db = await getDb();
    return db.transaction(async (tx) => {
      const bucket = await lookupOrCreateGuestBucket(tx, params.abuseBinding!);
      return {
        ...mapQuotaBucketToState(bucket, 'guest', degraded),
        bucket,
        errorCode:
          bucket.linkedUserId != null
            ? FREE_QUOTA_ERROR.ANON_BUCKET_LINKED_LOGIN_REQUIRED
            : bucket.remaining <= 0
              ? FREE_QUOTA_ERROR.ANON_QUOTA_EXHAUSTED
              : null,
      };
    });
  }

  if (!params.userId) {
    throw new Error('User quota state requires userId');
  }

  const db = await getDb();
  return db.transaction(async (tx) => {
    let bucket = params.createIfMissing
      ? await lookupOrCreateUserBucket(tx, params.userId!)
      : await selectQuotaBucketBySubjectForUpdate(tx, {
          subjectType: 'user',
          subjectId: params.userId!,
        });
    if (!bucket) {
      return {
        ...mapQuotaBucketToState(null, 'user', degraded),
        bucket: null,
        errorCode: null,
      };
    }
    bucket = await lazyRefillBucket(tx, bucket);
    return {
      ...mapQuotaBucketToState(bucket, 'user', degraded),
      bucket,
      errorCode:
        bucket.remaining <= 0 ? FREE_QUOTA_ERROR.USER_QUOTA_EXHAUSTED : null,
    };
  });
}

export async function getFreeQuotaState(params: {
  subjectType: FreeQuotaSubjectType;
  userId?: string;
  abuseBinding?: AbuseBinding;
}) {
  const result = await getFreeQuotaStateInternal(params);
  return result;
}

export async function getFreeQuotaStatus(params: {
  subjectType: FreeQuotaSubjectType;
  userId?: string;
  derivedAbuseBindKey?: DerivedAbuseBindKey;
  visitorIdRiskSignal?: string | null;
  createIfMissing?: boolean;
  now?: Date;
}) {
  const abuseBinding = params.derivedAbuseBindKey
    ? {
        ...params.derivedAbuseBindKey,
        visitorIdRiskSignal:
          params.visitorIdRiskSignal ??
          params.derivedAbuseBindKey.visitorIdRiskSignal,
      }
    : undefined;

  return getFreeQuotaStateInternal({
    subjectType: params.subjectType,
    userId: params.userId,
    abuseBinding,
    createIfMissing: params.createIfMissing,
  });
}

async function consumeFreeQuotaOrThrow(params: {
  subjectType: FreeQuotaSubjectType;
  userId?: string;
  abuseBinding?: AbuseBinding;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    let bucket: QuotaBucketRecord;

    if (params.subjectType === 'guest') {
      if (!params.abuseBinding) {
        throw new Error('Guest quota consumption requires abuse binding');
      }
      bucket = await lookupOrCreateGuestBucket(tx, params.abuseBinding);

      if (bucket.linkedUserId) {
        throw new FreeQuotaError(
          FREE_QUOTA_ERROR.ANON_BUCKET_LINKED_LOGIN_REQUIRED
        );
      }
    } else {
      if (!params.userId) {
        throw new Error('User quota consumption requires userId');
      }
      bucket = await lookupOrCreateUserBucket(tx, params.userId);
      bucket = await lazyRefillBucket(tx, bucket);
    }

    if (bucket.remaining <= 0) {
      if (bucket.policy === FREE_QUOTA_POLICY.USER_FREE_10MIN) {
        throw new FreeQuotaError(
          FREE_QUOTA_ERROR.USER_QUOTA_EXHAUSTED,
          bucket.nextRefillAt
        );
      }

      throw new FreeQuotaError(FREE_QUOTA_ERROR.ANON_QUOTA_EXHAUSTED);
    }

    const newRemaining = Math.max(0, bucket.remaining - 1);
    const now = new Date();
    const nextRefillAt =
      newRemaining === 0 && bucket.policy === FREE_QUOTA_POLICY.USER_FREE_10MIN
        ? new Date(now.getTime() + getUserCooldownMinutes() * 60 * 1000)
        : bucket.nextRefillAt;

    // Backfill visitor fingerprint on existing buckets: the field is
    // only set at insert time, but buckets created before fingerprint
    // was wired (or created during a request without a fingerprint)
    // would otherwise stay null forever and defeat visitor-risk
    // detection. Only overwrite when we currently have no signal.
    const backfillVisitorId =
      params.subjectType === 'guest' &&
      !bucket.visitorIdRiskSignal &&
      params.abuseBinding?.visitorIdRiskSignal
        ? params.abuseBinding.visitorIdRiskSignal
        : null;

    const [updated] = await tx
      .update(quotaBucket)
      .set({
        remaining: newRemaining,
        nextRefillAt,
        exhaustedAt:
          newRemaining === 0 &&
          bucket.policy === FREE_QUOTA_POLICY.USER_FREE_10MIN
            ? now
            : bucket.exhaustedAt,
        updatedAt: now,
        ...(backfillVisitorId
          ? { visitorIdRiskSignal: backfillVisitorId }
          : {}),
      })
      .where(eq(quotaBucket.id, bucket.id))
      .returning();

    if (!updated) {
      throw new Error('Failed to update quota bucket');
    }

    return {
      bucket: updated,
      state: mapQuotaBucketToState(
        updated,
        params.subjectType,
        params.abuseBinding?.degraded ?? false
      ),
    };
  });
}

export async function consumeFreeQuota(params: {
  subjectType: FreeQuotaSubjectType;
  userId?: string;
  abuseBinding?: AbuseBinding;
  derivedAbuseBindKey?: DerivedAbuseBindKey;
  visitorIdRiskSignal?: string | null;
}) {
  const abuseBinding = params.abuseBinding
    ? {
        ...params.abuseBinding,
        visitorIdRiskSignal:
          params.visitorIdRiskSignal ?? params.abuseBinding.visitorIdRiskSignal,
      }
    : params.derivedAbuseBindKey
      ? {
          ...params.derivedAbuseBindKey,
          visitorIdRiskSignal:
            params.visitorIdRiskSignal ??
            params.derivedAbuseBindKey.visitorIdRiskSignal,
        }
      : undefined;

  try {
    const result = await consumeFreeQuotaOrThrow({
      subjectType: params.subjectType,
      userId: params.userId,
      abuseBinding,
    });

    return {
      ok: true as const,
      bucket: result.bucket,
      state: result.state,
      errorCode: null,
      nextRefillAt: result.bucket.nextRefillAt,
    };
  } catch (error) {
    if (error instanceof FreeQuotaError) {
      return {
        ok: false as const,
        bucket: null,
        state: null,
        errorCode: error.code,
        nextRefillAt: error.nextRefillAt ?? null,
      };
    }

    throw error;
  }
}

export async function refundFreeQuota(params: { bucketId: string }) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const bucket = await selectQuotaBucketForUpdate(tx, params.bucketId);
    if (!bucket) {
      return null;
    }

    const nextRemaining = Math.min(bucket.remaining + 1, bucket.capacity);
    const shouldClearCooldown = bucket.remaining === 0 && nextRemaining > 0;

    const [updated] = await tx
      .update(quotaBucket)
      .set({
        remaining: nextRemaining,
        nextRefillAt: shouldClearCooldown ? null : bucket.nextRefillAt,
        exhaustedAt: shouldClearCooldown ? null : bucket.exhaustedAt,
        updatedAt: new Date(),
      })
      .where(eq(quotaBucket.id, bucket.id))
      .returning();

    return updated ?? bucket;
  });
}

export async function claimGuestQuota(params: {
  guestId: string | null;
  userId: string;
}) {
  if (!params.guestId) {
    return {
      claimedCount: 0,
      withheld: false,
      userBucket: null as QuotaBucketRecord | null,
    };
  }

  const db = await getDb();

  return db.transaction(async (tx) => {
    const latestRows = await tx
      .select({
        quotaBucketId: guestGeneration.quotaBucketId,
        abuseBindKeySnapshot: guestGeneration.abuseBindKeySnapshot,
      })
      .from(guestGeneration)
      .where(eq(guestGeneration.guestId, params.guestId!))
      .orderBy(desc(guestGeneration.createdAt))
      .limit(1);

    const latest = latestRows[0];
    if (!latest?.quotaBucketId && !latest?.abuseBindKeySnapshot) {
      return {
        claimedCount: 0,
        withheld: false,
        userBucket: await lookupOrCreateUserBucket(tx, params.userId),
      };
    }

    let guestBucket: QuotaBucketRecord | null = null;
    if (latest.quotaBucketId) {
      guestBucket = await selectQuotaBucketForUpdate(tx, latest.quotaBucketId);
    }

    if (!guestBucket && latest.abuseBindKeySnapshot) {
      guestBucket = await selectQuotaBucketBySubjectForUpdate(tx, {
        subjectType: 'guest',
        subjectId: latest.abuseBindKeySnapshot,
      });
    }

    if (!guestBucket) {
      return {
        claimedCount: 0,
        withheld: false,
        userBucket: await lookupOrCreateUserBucket(tx, params.userId),
      };
    }

    if (
      guestBucket.linkedUserId !== null &&
      guestBucket.linkedUserId !== params.userId
    ) {
      return {
        claimedCount: 0,
        withheld: true,
        userBucket: null,
      };
    }

    const claimed = await tx
      .update(guestGeneration)
      .set({
        userId: params.userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(guestGeneration.guestId, params.guestId!),
          isNull(guestGeneration.userId)
        )
      )
      .returning({ id: guestGeneration.id });

    await tx
      .update(quotaBucket)
      .set({
        linkedUserId: params.userId,
        updatedAt: new Date(),
      })
      .where(eq(quotaBucket.id, guestBucket.id));

    const userBucket = await lookupOrCreateUserBucket(tx, params.userId);

    return {
      claimedCount: claimed.length,
      withheld: false,
      userBucket,
    };
  });
}
