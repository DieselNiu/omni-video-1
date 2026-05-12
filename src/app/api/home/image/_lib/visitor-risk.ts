import { getDb } from '@/db';
import { quotaBucket } from '@/db/schema';
import { and, eq, gte, sql } from 'drizzle-orm';

// An "anomaly" here is one stable visitor fingerprint that has
// appeared under many distinct abuseBindKeys in a short window —
// the classic cookie-hopping / proxy-rotation pattern for farming
// multiple free-quota buckets out of a single human session.
const VISITOR_LOOKBACK_MINUTES = 60;
const VISITOR_ABUSE_BIND_LIMIT = 2;

export interface VisitorRiskAssessment {
  anomalous: boolean;
  distinctBindKeys: number;
}

/**
 * Ask: has this visitor fingerprint been seen under more than
 * VISITOR_ABUSE_BIND_LIMIT distinct guest subjects within the past
 * hour? Each distinct subject represents a fresh free-quota bucket,
 * so this is the cheapest signal we have for "same human, many
 * buckets" without any browser-fingerprint library.
 *
 * Returns a benign result when visitorId is missing — we simply have
 * no signal and don't penalize unknowns. A DB failure here should
 * never block a submit, so we swallow errors and fall back to "not
 * anomalous".
 */
export async function evaluateVisitorRisk(params: {
  visitorId: string | null;
  now?: Date;
}): Promise<VisitorRiskAssessment> {
  if (!params.visitorId) {
    return { anomalous: false, distinctBindKeys: 0 };
  }

  try {
    const db = await getDb();
    const now = params.now ?? new Date();
    const cutoff = new Date(
      now.getTime() - VISITOR_LOOKBACK_MINUTES * 60 * 1000
    );

    const rows = await db
      .select({
        count: sql<number>`count(distinct ${quotaBucket.subjectId})`.as(
          'distinct_bind_keys'
        ),
      })
      .from(quotaBucket)
      .where(
        and(
          eq(quotaBucket.visitorIdRiskSignal, params.visitorId),
          eq(quotaBucket.subjectType, 'guest'),
          gte(quotaBucket.updatedAt, cutoff)
        )
      );

    const distinctBindKeys = Number(rows[0]?.count ?? 0);
    return {
      anomalous: distinctBindKeys > VISITOR_ABUSE_BIND_LIMIT,
      distinctBindKeys,
    };
  } catch (error) {
    console.error('[home-image.submit] visitor-risk query failed:', error);
    return { anomalous: false, distinctBindKeys: 0 };
  }
}
