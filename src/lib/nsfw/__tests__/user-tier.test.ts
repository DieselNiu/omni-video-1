import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserPaymentTier, isPaidUser } from '../user-tier';

// Mock database module
vi.mock('@/db', () => ({
  getDb: vi.fn(),
}));

// Mock schema
vi.mock('@/db/schema', () => ({
  user: {
    id: 'id',
    adminGrantedPro: 'adminGrantedPro',
    adminGrantedProExpiresAt: 'adminGrantedProExpiresAt',
  },
  payment: {
    paid: 'paid',
    userId: 'userId',
    type: 'type',
    scene: 'scene',
    status: 'status',
  },
  creditTransaction: {
    userId: 'userId',
    remainingAmount: 'remainingAmount',
    expirationDate: 'expirationDate',
    type: 'type',
    id: 'id',
  },
}));

// Mock payment types
vi.mock('@/payment/types', () => ({
  PaymentTypes: { SUBSCRIPTION: 'subscription' },
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  gt: vi.fn((a: unknown, b: unknown) => ({ gt: [a, b] })),
  or: vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((a: unknown) => ({ isNull: a })),
  inArray: vi.fn((a: unknown, b: unknown) => ({ inArray: [a, b] })),
  not: vi.fn((a: unknown) => ({ not: a })),
}));

// Mock credits types
vi.mock('@/credits/types', () => ({
  CREDIT_TRANSACTION_TYPE: {
    REGISTER_GIFT: 'REGISTER_GIFT',
    MONTHLY_REFRESH: 'MONTHLY_REFRESH',
    DAILY_CHECKIN: 'DAILY_CHECKIN',
    GIFT: 'GIFT',
    VIDEO_GENERATION_REFUND: 'VIDEO_GENERATION_REFUND',
    IMAGE_GENERATION_REFUND: 'IMAGE_GENERATION_REFUND',
    REFUND: 'REFUND',
  },
}));

import { getDb } from '@/db';

function createMockDb(
  subscriptionResults: unknown[],
  creditResults: unknown[],
  userResults: unknown[] = [{}] // default: user exists with no adminGrantedPro
) {
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();
  const mockLimit = vi.fn();

  // Chain: db.select().from().where().limit()
  // getUserPaymentTier calls .limit(1) THREE times in order:
  //   1. user (adminGrantedPro check)
  //   2. payment (active subscription)
  //   3. creditTransaction (paid credits, via hasPaidCredits)
  let callCount = 0;
  mockLimit.mockImplementation(() => {
    callCount++;
    if (callCount === 1) return userResults;
    if (callCount === 2) return subscriptionResults;
    return creditResults;
  });
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });

  return { select: mockSelect };
}

describe('User Payment Tier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserPaymentTier', () => {
    it('should return "subscription" for active monthly subscriber', async () => {
      const mockDb = createMockDb(
        [{ type: 'subscription', status: 'active' }],
        []
      );
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const tier = await getUserPaymentTier('user-1');
      expect(tier).toBe('subscription');
    });

    it('should return "subscription" for trialing subscriber', async () => {
      const mockDb = createMockDb(
        [{ type: 'subscription', status: 'trialing' }],
        []
      );
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const tier = await getUserPaymentTier('user-2');
      expect(tier).toBe('subscription');
    });

    it('should return "credits" for user with valid credits (no subscription)', async () => {
      const mockDb = createMockDb(
        [], // no active subscription
        [{ id: 'credit-1' }] // has valid credits
      );
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const tier = await getUserPaymentTier('user-3');
      expect(tier).toBe('credits');
    });

    it('should return "free" for user with no subscription and no credits', async () => {
      const mockDb = createMockDb([], []);
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const tier = await getUserPaymentTier('user-4');
      expect(tier).toBe('free');
    });

    it('should return "free" for user with expired credits only', async () => {
      const mockDb = createMockDb(
        [], // no subscription
        [] // credits query returns empty (all expired/depleted)
      );
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const tier = await getUserPaymentTier('user-5');
      expect(tier).toBe('free');
    });
  });

  describe('isPaidUser', () => {
    it('should return true for active subscriber', async () => {
      const mockDb = createMockDb(
        [{ type: 'subscription', status: 'active' }],
        []
      );
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      expect(await isPaidUser('user-1')).toBe(true);
    });

    it('should return true for user with valid credits', async () => {
      const mockDb = createMockDb([], [{ id: 'credit-1' }]);
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      expect(await isPaidUser('user-3')).toBe(true);
    });

    it('should return false for free user', async () => {
      const mockDb = createMockDb([], []);
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      expect(await isPaidUser('user-4')).toBe(false);
    });
  });
});
