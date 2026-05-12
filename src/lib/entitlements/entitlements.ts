import { randomUUID } from 'crypto';
import { getDb } from '@/db';
import { userEntitlement } from '@/db/schema';
import { trackServerEvent } from '@/lib/analytics/server';
import { findPlanByPriceId, findPriceInPlan } from '@/lib/price-plan';
import { PaymentTypes, PlanIntervals } from '@/payment/types';
import { and, desc, eq, gt, lte } from 'drizzle-orm';
import {
  ENTITLEMENT_SCOPE,
  ENTITLEMENT_SOURCE,
  ENTITLEMENT_STATUS,
  ENTITLEMENT_TYPE,
} from './constants';

export function isEntitlementActiveAt(params: {
  status: string;
  startsAt: Date;
  expiresAt: Date;
  at?: Date;
}) {
  const at = params.at ?? new Date();
  if (params.status !== ENTITLEMENT_STATUS.ACTIVE) return false;
  return params.startsAt <= at && params.expiresAt > at;
}

export async function hasActiveEntitlement(
  userId: string,
  scope: string,
  at: Date = new Date()
): Promise<boolean> {
  const db = await getDb();
  const [record] = await db
    .select({ id: userEntitlement.id })
    .from(userEntitlement)
    .where(
      and(
        eq(userEntitlement.userId, userId),
        eq(userEntitlement.scope, scope),
        eq(userEntitlement.status, ENTITLEMENT_STATUS.ACTIVE),
        lte(userEntitlement.startsAt, at),
        gt(userEntitlement.expiresAt, at)
      )
    )
    .limit(1);

  return !!record;
}

export async function getActiveEntitlements(
  userId: string,
  at: Date = new Date()
) {
  const db = await getDb();
  return db
    .select()
    .from(userEntitlement)
    .where(
      and(
        eq(userEntitlement.userId, userId),
        eq(userEntitlement.status, ENTITLEMENT_STATUS.ACTIVE),
        lte(userEntitlement.startsAt, at),
        gt(userEntitlement.expiresAt, at)
      )
    )
    .orderBy(desc(userEntitlement.expiresAt));
}

export async function grantEntitlement(params: {
  userId: string;
  type: string;
  scope: string;
  source: string;
  startsAt: Date;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDb();
  await db.insert(userEntitlement).values({
    id: randomUUID(),
    userId: params.userId,
    type: params.type,
    scope: params.scope,
    status: ENTITLEMENT_STATUS.ACTIVE,
    source: params.source,
    startsAt: params.startsAt,
    expiresAt: params.expiresAt,
    metadata: params.metadata,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

/** Plans eligible for nano family entitlement when subscribed yearly */
const NANO_ENTITLED_PLAN_IDS = ['pro', 'premium'] as const;

export function isYearlyNanoEntitledPriceId(priceId: string): boolean {
  if (!priceId) return false;
  const plan = findPlanByPriceId(priceId);
  if (
    !plan ||
    !NANO_ENTITLED_PLAN_IDS.includes(
      plan.id as (typeof NANO_ENTITLED_PLAN_IDS)[number]
    )
  )
    return false;
  const price = findPriceInPlan(plan.id, priceId);
  if (!price) return false;
  return (
    price.type === PaymentTypes.SUBSCRIPTION &&
    price.interval === PlanIntervals.YEAR
  );
}

/** Derive entitlement source from priceId */
function deriveEntitlementSource(priceId: string): string {
  const plan = findPlanByPriceId(priceId);
  if (plan?.id === 'premium') return ENTITLEMENT_SOURCE.YEARLY_PREMIUM;
  return ENTITLEMENT_SOURCE.YEARLY_PRO;
}

export async function grantNanoFamilyEntitlementForSubscription(params: {
  userId: string;
  priceId: string;
  startsAt: Date;
  expiresAt: Date;
  source?: string;
}) {
  if (!isYearlyNanoEntitledPriceId(params.priceId)) {
    return false;
  }

  const source = params.source || deriveEntitlementSource(params.priceId);

  const db = await getDb();
  const [existing] = await db
    .select({ id: userEntitlement.id })
    .from(userEntitlement)
    .where(
      and(
        eq(userEntitlement.userId, params.userId),
        eq(userEntitlement.scope, ENTITLEMENT_SCOPE.NANO_FAMILY),
        eq(userEntitlement.type, ENTITLEMENT_TYPE.UNLIMITED_ACCESS),
        eq(userEntitlement.source, source),
        eq(userEntitlement.startsAt, params.startsAt),
        eq(userEntitlement.expiresAt, params.expiresAt)
      )
    )
    .limit(1);

  if (existing) {
    return true;
  }

  await grantEntitlement({
    userId: params.userId,
    type: ENTITLEMENT_TYPE.UNLIMITED_ACCESS,
    scope: ENTITLEMENT_SCOPE.NANO_FAMILY,
    source,
    startsAt: params.startsAt,
    expiresAt: params.expiresAt,
    metadata: {
      priceId: params.priceId,
    },
  });

  trackServerEvent('nano_entitlement_granted', {
    userId: params.userId,
    priceId: params.priceId,
    source,
    startsAt: params.startsAt,
    expiresAt: params.expiresAt,
  });
  trackServerEvent('pricing_yearly_pro_checkout_completed', {
    userId: params.userId,
    priceId: params.priceId,
    source,
    startsAt: params.startsAt,
    expiresAt: params.expiresAt,
  });

  return true;
}
