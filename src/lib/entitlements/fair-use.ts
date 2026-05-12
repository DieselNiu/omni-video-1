import { getDb } from '@/db';
import { asset } from '@/db/schema';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { NANO_FAMILY_MODEL_IDS, isNanoFamilyModel } from './nano-family';

export const FAIR_USE_ERROR_CODE = 'FAIR_USE_LIMIT_REACHED';

const DEFAULT_LIMITS = {
  maxConcurrentNanoTasks: 2,
  dailyNanoFamilySoftLimit: 300,
  dailyNanoProSoftLimit: 100,
  dailyNanoPro4kSoftLimit: 30,
};

const parseLimit = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const NANO_FAMILY_FAIR_USE_LIMITS = {
  maxConcurrentNanoTasks: parseLimit(
    process.env.NANO_FAMILY_MAX_CONCURRENT,
    DEFAULT_LIMITS.maxConcurrentNanoTasks
  ),
  dailyNanoFamilySoftLimit: parseLimit(
    process.env.NANO_FAMILY_DAILY_LIMIT,
    DEFAULT_LIMITS.dailyNanoFamilySoftLimit
  ),
  dailyNanoProSoftLimit: parseLimit(
    process.env.NANO_FAMILY_DAILY_PRO_LIMIT,
    DEFAULT_LIMITS.dailyNanoProSoftLimit
  ),
  dailyNanoPro4kSoftLimit: parseLimit(
    process.env.NANO_FAMILY_DAILY_PRO_4K_LIMIT,
    DEFAULT_LIMITS.dailyNanoPro4kSoftLimit
  ),
};

export class FairUseError extends Error {
  code = FAIR_USE_ERROR_CODE;
  status = 429;

  constructor(message: string) {
    super(message);
    this.name = 'FairUseError';
  }
}

const IN_PROGRESS_STATUSES = ['PENDING', 'IN_QUEUE', 'IN_PROGRESS'] as const;

const getUtcDayStart = (now: Date = new Date()) => {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
};

export async function getActiveNanoTaskCount(userId: string): Promise<number> {
  const db = await getDb();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(asset)
    .where(
      and(
        eq(asset.userId, userId),
        eq(asset.type, 'image'),
        inArray(asset.modelId, [...NANO_FAMILY_MODEL_IDS]),
        inArray(asset.status, [...IN_PROGRESS_STATUSES])
      )
    );
  return Number(count) || 0;
}

export async function getNanoFamilyUsageToday(userId: string): Promise<number> {
  const db = await getDb();
  const startOfDay = getUtcDayStart();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(asset)
    .where(
      and(
        eq(asset.userId, userId),
        eq(asset.type, 'image'),
        inArray(asset.modelId, [...NANO_FAMILY_MODEL_IDS]),
        gte(asset.createdAt, startOfDay)
      )
    );
  return Number(count) || 0;
}

export async function getNanoProUsageToday(userId: string): Promise<number> {
  const db = await getDb();
  const startOfDay = getUtcDayStart();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(asset)
    .where(
      and(
        eq(asset.userId, userId),
        eq(asset.type, 'image'),
        eq(asset.modelId, 'nano-banana-pro'),
        gte(asset.createdAt, startOfDay)
      )
    );
  return Number(count) || 0;
}

export async function getNanoPro4kUsageToday(userId: string): Promise<number> {
  const db = await getDb();
  const startOfDay = getUtcDayStart();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(asset)
    .where(
      and(
        eq(asset.userId, userId),
        eq(asset.type, 'image'),
        eq(asset.modelId, 'nano-banana-pro'),
        eq(asset.resolution, '4K'),
        gte(asset.createdAt, startOfDay)
      )
    );
  return Number(count) || 0;
}

export async function assertNanoFamilyFairUse(
  userId: string,
  modelId: string,
  resolution?: string
) {
  if (!isNanoFamilyModel(modelId)) {
    return;
  }

  const [activeCount, nanoFamilyCount, nanoProCount, nanoPro4kCount] =
    await Promise.all([
      getActiveNanoTaskCount(userId),
      getNanoFamilyUsageToday(userId),
      getNanoProUsageToday(userId),
      getNanoPro4kUsageToday(userId),
    ]);

  if (activeCount >= NANO_FAMILY_FAIR_USE_LIMITS.maxConcurrentNanoTasks) {
    throw new FairUseError(
      'You have reached the system fair-use threshold for Nano generation today. Please try again later.'
    );
  }

  if (nanoFamilyCount >= NANO_FAMILY_FAIR_USE_LIMITS.dailyNanoFamilySoftLimit) {
    throw new FairUseError(
      'You have reached the system fair-use threshold for Nano generation today. Please try again later.'
    );
  }

  if (
    modelId === 'nano-banana-pro' &&
    nanoProCount >= NANO_FAMILY_FAIR_USE_LIMITS.dailyNanoProSoftLimit
  ) {
    throw new FairUseError(
      'You have reached the system fair-use threshold for Nano generation today. Please try again later.'
    );
  }

  if (
    modelId === 'nano-banana-pro' &&
    resolution === '4K' &&
    nanoPro4kCount >= NANO_FAMILY_FAIR_USE_LIMITS.dailyNanoPro4kSoftLimit
  ) {
    throw new FairUseError(
      'You have reached the system fair-use threshold for Nano generation today. Please try again later.'
    );
  }
}
