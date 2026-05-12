import { randomUUID } from 'crypto';
import { websiteConfig } from '@/config/website';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { getDb } from '@/db';
import { creditTransaction, dailyCheckin, userCredit } from '@/db/schema';
import { addDays } from 'date-fns';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  getCurrentCheckinDate,
  getNextCheckinResetAt,
  getPreviousCheckinDate,
} from './checkin-date';
import { deriveCheckinStatus, deriveClaimDecision } from './checkin-logic';
import { CHECKIN_MAX_CLAIMS, CHECKIN_REWARDS } from './constants';

export interface DailyCheckinStatus {
  hasCheckedInToday: boolean;
  currentDay: number;
  claimedCount: number;
  nextRewardCredits: number;
  isCompleted: boolean;
  rewards: number[];
  checkedDays: number[];
  resetAt: string;
}

export interface DailyCheckinClaimResult {
  alreadyClaimed: boolean;
  claimedDay: number;
  claimedCount: number;
  rewardCredits: number;
  currentCredits: number;
  nextDay: number | null;
  isCompleted: boolean;
  resetAt: string;
}

const getExpireDays = () =>
  websiteConfig.credits?.registerGiftCredits?.expireDays ?? 30;

async function getClaimedCount(db: any, userId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(dailyCheckin)
    .where(eq(dailyCheckin.userId, userId));
  return Number(count) || 0;
}

async function getCurrentCredits(db: any, userId: string): Promise<number> {
  const [record] = await db
    .select({ currentCredits: userCredit.currentCredits })
    .from(userCredit)
    .where(eq(userCredit.userId, userId))
    .limit(1);
  return record?.currentCredits || 0;
}

export async function getDailyCheckinStatus(
  userId: string
): Promise<DailyCheckinStatus> {
  const db = await getDb();
  const todayKey = getCurrentCheckinDate();
  const yesterdayKey = getPreviousCheckinDate(todayKey);

  const [latestRecord] = await db
    .select({
      checkinDate: dailyCheckin.checkinDate,
      streakDay: dailyCheckin.streakDay,
    })
    .from(dailyCheckin)
    .where(eq(dailyCheckin.userId, userId))
    .orderBy(desc(dailyCheckin.createdAt))
    .limit(1);

  const claimedCount = await getClaimedCount(db, userId);
  const derived = deriveCheckinStatus({
    todayKey,
    yesterdayKey,
    latestRecord,
    claimedCount,
  });

  return {
    hasCheckedInToday: derived.hasCheckedInToday,
    currentDay: derived.currentDay,
    claimedCount,
    nextRewardCredits: derived.nextRewardCredits,
    isCompleted: derived.isCompleted,
    rewards: [...CHECKIN_REWARDS],
    checkedDays: derived.checkedDays,
    resetAt: getNextCheckinResetAt(todayKey),
  };
}

export async function claimDailyCheckin(
  userId: string
): Promise<DailyCheckinClaimResult> {
  const db = await getDb();
  const todayKey = getCurrentCheckinDate();
  const yesterdayKey = getPreviousCheckinDate(todayKey);
  const resetAt = getNextCheckinResetAt(todayKey);
  const expireDays = getExpireDays();

  let result: DailyCheckinClaimResult = {
    alreadyClaimed: false,
    claimedDay: 1,
    claimedCount: 0,
    rewardCredits: 0,
    currentCredits: 0,
    nextDay: 1,
    isCompleted: false,
    resetAt,
  };

  await db.transaction(async (tx) => {
    const [existingToday] = await tx
      .select({
        streakDay: dailyCheckin.streakDay,
        rewardCredits: dailyCheckin.rewardCredits,
      })
      .from(dailyCheckin)
      .where(
        and(
          eq(dailyCheckin.userId, userId),
          eq(dailyCheckin.checkinDate, todayKey)
        )
      )
      .limit(1);

    if (existingToday) {
      const claimedCount = await getClaimedCount(tx, userId);
      const currentCredits = await getCurrentCredits(tx, userId);
      const decision = deriveClaimDecision({
        yesterdayKey,
        claimedCount,
        existingToday,
      });
      result = {
        alreadyClaimed: decision.alreadyClaimed,
        claimedDay: decision.claimedDay,
        claimedCount: decision.claimedCount,
        rewardCredits: decision.rewardCredits,
        currentCredits,
        nextDay: decision.nextDay,
        isCompleted: decision.isCompleted,
        resetAt,
      };
      return;
    }

    const claimedCount = await getClaimedCount(tx, userId);
    let latestRecord: { checkinDate: string; streakDay: number } | undefined;

    if (claimedCount < CHECKIN_MAX_CLAIMS) {
      [latestRecord] = await tx
        .select({
          checkinDate: dailyCheckin.checkinDate,
          streakDay: dailyCheckin.streakDay,
        })
        .from(dailyCheckin)
        .where(eq(dailyCheckin.userId, userId))
        .orderBy(desc(dailyCheckin.createdAt))
        .limit(1);
    }

    const decision = deriveClaimDecision({
      yesterdayKey,
      claimedCount,
      latestRecord,
    });

    if (!decision.shouldCreateRecord) {
      const currentCredits = await getCurrentCredits(tx, userId);
      result = {
        alreadyClaimed: decision.alreadyClaimed,
        claimedDay: decision.claimedDay,
        claimedCount: decision.claimedCount,
        rewardCredits: decision.rewardCredits,
        currentCredits,
        nextDay: decision.nextDay,
        isCompleted: decision.isCompleted,
        resetAt,
      };
      return;
    }

    const rewardCredits = decision.rewardCredits;
    const claimedDay = decision.claimedDay;
    const now = new Date();
    const expirationDate = expireDays ? addDays(now, expireDays) : undefined;

    await tx.insert(dailyCheckin).values({
      id: randomUUID(),
      userId,
      checkinDate: todayKey,
      streakDay: claimedDay,
      rewardCredits,
      cycleId: null,
      createdAt: now,
    });

    await tx.insert(creditTransaction).values({
      id: randomUUID(),
      userId,
      type: CREDIT_TRANSACTION_TYPE.DAILY_CHECKIN,
      description: `Daily check-in reward: ${rewardCredits}`,
      amount: rewardCredits,
      remainingAmount: rewardCredits,
      expirationDate,
      createdAt: now,
      updatedAt: now,
    });

    await tx
      .insert(userCredit)
      .values({
        id: randomUUID(),
        userId,
        currentCredits: rewardCredits,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userCredit.userId,
        set: {
          currentCredits: sql`${userCredit.currentCredits} + ${rewardCredits}`,
          updatedAt: now,
        },
      });

    const currentCredits = await getCurrentCredits(tx, userId);

    result = {
      alreadyClaimed: decision.alreadyClaimed,
      claimedDay: decision.claimedDay,
      claimedCount: decision.claimedCount,
      rewardCredits: decision.rewardCredits,
      currentCredits,
      nextDay: decision.nextDay,
      isCompleted: decision.isCompleted,
      resetAt,
    };
  });

  return result;
}
