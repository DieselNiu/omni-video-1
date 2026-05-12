import { CHECKIN_MAX_CLAIMS, CHECKIN_REWARDS } from './constants';

export interface LatestCheckinRecord {
  checkinDate: string;
  streakDay: number;
  rewardCredits?: number;
}

export interface DerivedCheckinStatus {
  hasCheckedInToday: boolean;
  currentDay: number;
  checkedDays: number[];
  isCompleted: boolean;
  nextRewardCredits: number;
}

export interface ClaimDecision {
  alreadyClaimed: boolean;
  claimedDay: number;
  claimedCount: number;
  rewardCredits: number;
  isCompleted: boolean;
  nextDay: number | null;
  shouldCreateRecord: boolean;
}

const buildCheckedDays = (streakDay: number) =>
  Array.from({ length: streakDay }, (_, index) => index + 1);

export function deriveCheckinStatus(params: {
  todayKey: string;
  yesterdayKey: string;
  latestRecord?: LatestCheckinRecord;
  claimedCount: number;
}): DerivedCheckinStatus {
  const { todayKey, yesterdayKey, latestRecord, claimedCount } = params;
  const isCompleted = claimedCount >= CHECKIN_MAX_CLAIMS;

  let hasCheckedInToday = false;
  let currentDay = 1;
  let checkedDays: number[] = [];

  if (latestRecord?.checkinDate === todayKey) {
    hasCheckedInToday = true;
    currentDay = Math.min(latestRecord.streakDay, CHECKIN_MAX_CLAIMS);
    checkedDays = buildCheckedDays(latestRecord.streakDay);
  } else if (latestRecord?.checkinDate === yesterdayKey) {
    currentDay = Math.min(latestRecord.streakDay + 1, CHECKIN_MAX_CLAIMS);
    checkedDays = buildCheckedDays(latestRecord.streakDay);
  }

  // When completed, keep the actual streak display — don't force all 7 days lit
  const nextRewardCredits = isCompleted ? 0 : CHECKIN_REWARDS[currentDay - 1];

  return {
    hasCheckedInToday,
    currentDay,
    checkedDays,
    isCompleted,
    nextRewardCredits,
  };
}

export function deriveClaimDecision(params: {
  yesterdayKey: string;
  claimedCount: number;
  latestRecord?: LatestCheckinRecord;
  existingToday?: { streakDay: number; rewardCredits: number };
}): ClaimDecision {
  const { yesterdayKey, claimedCount, latestRecord, existingToday } = params;

  if (existingToday) {
    const isCompleted = claimedCount >= CHECKIN_MAX_CLAIMS;
    return {
      alreadyClaimed: true,
      claimedDay: existingToday.streakDay,
      claimedCount,
      rewardCredits: existingToday.rewardCredits,
      isCompleted,
      nextDay: isCompleted
        ? null
        : Math.min(existingToday.streakDay + 1, CHECKIN_MAX_CLAIMS),
      shouldCreateRecord: false,
    };
  }

  if (claimedCount >= CHECKIN_MAX_CLAIMS) {
    return {
      alreadyClaimed: false,
      claimedDay: CHECKIN_MAX_CLAIMS,
      claimedCount,
      rewardCredits: 0,
      isCompleted: true,
      nextDay: null,
      shouldCreateRecord: false,
    };
  }

  const claimedDay =
    latestRecord?.checkinDate === yesterdayKey
      ? Math.min(latestRecord.streakDay + 1, CHECKIN_MAX_CLAIMS)
      : 1;

  const rewardCredits = CHECKIN_REWARDS[claimedDay - 1];
  const updatedClaimedCount = claimedCount + 1;
  const isCompleted = updatedClaimedCount >= CHECKIN_MAX_CLAIMS;

  return {
    alreadyClaimed: false,
    claimedDay,
    claimedCount: updatedClaimedCount,
    rewardCredits,
    isCompleted,
    nextDay: isCompleted ? null : Math.min(claimedDay + 1, CHECKIN_MAX_CLAIMS),
    shouldCreateRecord: true,
  };
}
