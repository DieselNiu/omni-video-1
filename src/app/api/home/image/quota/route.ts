import {
  FREE_QUOTA_SUBJECT_TYPE,
  getFreeQuotaStatus,
} from '@/credits/free-quota';
import { auth } from '@/lib/auth';
import {
  HOME_IMAGE_ACCESS_MODE,
  isClassicCreditsMode,
  resolveHomeImageAccess,
} from '@/lib/home-image/resolve-access';
import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { HOME_IMAGE_ALLOWED_MODEL_ID } from '../_lib/constants';
import { jsonNoStore } from '../_lib/http';
import {
  deriveRequestAbuseBindKey,
  getVisitorIdRiskSignal,
  isSameOriginRequest,
} from '../_lib/request';

export async function GET(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return jsonNoStore({ error: 'Forbidden' }, { status: 403 });
    }

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    const serverNow = new Date();
    if (session?.user?.id) {
      const access = await resolveHomeImageAccess({
        userId: session.user.id,
        modelId: HOME_IMAGE_ALLOWED_MODEL_ID,
      });

      if (access.mode === HOME_IMAGE_ACCESS_MODE.CREDITS) {
        return jsonNoStore({
          subjectType: 'user',
          accessMode: HOME_IMAGE_ACCESS_MODE.CREDITS,
          remaining: 0,
          capacity: 0,
          policy: 'USER_FREE_10MIN',
          nextRefillAt: null,
          exhausted: false,
          errorCode: null,
          degraded: false,
          serverNow: serverNow.toISOString(),
          currentCredits: access.currentCredits,
          hasSuccessfulCreditPurchase: access.hasSuccessfulCreditPurchase,
        });
      }

      if (access.mode === HOME_IMAGE_ACCESS_MODE.PURCHASE_REQUIRED) {
        return jsonNoStore({
          subjectType: 'user',
          accessMode: HOME_IMAGE_ACCESS_MODE.PURCHASE_REQUIRED,
          remaining: 0,
          capacity: 0,
          policy: 'USER_FREE_10MIN',
          nextRefillAt: null,
          exhausted: false,
          errorCode: null,
          degraded: false,
          serverNow: serverNow.toISOString(),
          currentCredits: 0,
          hasSuccessfulCreditPurchase: true,
        });
      }

      const quotaStatus = await getFreeQuotaStatus({
        subjectType: FREE_QUOTA_SUBJECT_TYPE.USER,
        userId: session.user.id,
        createIfMissing: true,
        now: serverNow,
      });

      return jsonNoStore({
        subjectType: quotaStatus.subjectType,
        accessMode: HOME_IMAGE_ACCESS_MODE.FREE_QUOTA,
        remaining: quotaStatus.remaining,
        capacity: quotaStatus.capacity,
        policy: quotaStatus.policy,
        nextRefillAt: quotaStatus.nextRefillAt?.toISOString() ?? null,
        exhausted: quotaStatus.exhausted,
        errorCode: quotaStatus.errorCode,
        degraded: false,
        serverNow: serverNow.toISOString(),
        currentCredits: 0,
        hasSuccessfulCreditPurchase: false,
      });
    }

    // Classic mode: no guest quota bucket — frontend renders a "sign in"
    // CTA based on accessMode=login_required and routes the click to the
    // login modal. Skip abuse-binding/quota lookup entirely.
    if (isClassicCreditsMode()) {
      return jsonNoStore({
        subjectType: 'guest',
        accessMode: HOME_IMAGE_ACCESS_MODE.LOGIN_REQUIRED,
        remaining: 0,
        capacity: 0,
        policy: 'ANON_ONE_SHOT',
        nextRefillAt: null,
        exhausted: true,
        errorCode: null,
        degraded: false,
        serverNow: serverNow.toISOString(),
        currentCredits: 0,
        hasSuccessfulCreditPurchase: false,
      });
    }

    const derivedAbuseBindKey = await deriveRequestAbuseBindKey(request);
    const quotaStatus = await getFreeQuotaStatus({
      subjectType: FREE_QUOTA_SUBJECT_TYPE.GUEST,
      derivedAbuseBindKey,
      visitorIdRiskSignal: getVisitorIdRiskSignal(request),
      createIfMissing: true,
      now: serverNow,
    });

    return jsonNoStore({
      subjectType: quotaStatus.subjectType,
      accessMode: HOME_IMAGE_ACCESS_MODE.GUEST_QUOTA,
      remaining: quotaStatus.remaining,
      capacity: quotaStatus.capacity,
      policy: quotaStatus.policy,
      nextRefillAt: quotaStatus.nextRefillAt?.toISOString() ?? null,
      exhausted: quotaStatus.exhausted,
      errorCode: quotaStatus.errorCode,
      degraded: derivedAbuseBindKey.degraded,
      serverNow: serverNow.toISOString(),
      currentCredits: 0,
      hasSuccessfulCreditPurchase: false,
    });
  } catch (error) {
    console.error('[home-image.quota] error:', error);
    return jsonNoStore({ error: 'Internal server error' }, { status: 500 });
  }
}
