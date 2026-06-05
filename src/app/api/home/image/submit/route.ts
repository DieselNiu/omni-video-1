import { websiteConfig } from '@/config/website';
import {
  FREE_QUOTA_ERROR_CODE,
  FREE_QUOTA_SUBJECT_TYPE,
  consumeFreeQuota,
  getFreeQuotaStatus,
  refundFreeQuota,
} from '@/credits/free-quota';
import { trackServerEvent } from '@/lib/analytics/server';
import { auth } from '@/lib/auth';
import {
  buildExecutionContext,
  resolveExecutionForSurface,
} from '@/lib/generation/resolve-execution';
import {
  HOME_IMAGE_ACCESS_MODE,
  isClassicCreditsMode,
  resolveHomeImageAccess,
} from '@/lib/home-image/resolve-access';
import { IMAGE_PRODUCTS } from '@/models/image-models';
import { headers } from 'next/headers';
import {
  captchaSiteKey,
  requiresSubmitCaptcha,
  verifySubmitCaptcha,
} from '../_lib/captcha-gate';
import { HOME_IMAGE_ERROR } from '../_lib/constants';
import { jsonNoStore } from '../_lib/http';
import {
  finalizeHomeIdempotencyFailure,
  finalizeHomeIdempotencySuccess,
  hashCanonicalJson,
  reserveHomeIdempotency,
} from '../_lib/idempotency';
import {
  deriveRequestAbuseBindKey,
  getVerifiedGuestId,
  getVisitorIdRiskSignal,
  isSameOriginRequest,
} from '../_lib/request';
import {
  delegateToFormalImageSubmit,
  submitHomeFreeGeneration,
} from '../_lib/submit';
import {
  type HomeSubmitPayload,
  validateHomeSubmitPayload,
} from '../_lib/validation';
import { evaluateVisitorRisk } from '../_lib/visitor-risk';

function buildQuotaErrorResponse(
  errorCode: string,
  nextRefillAt: Date | null,
  serverNow: Date
) {
  if (errorCode === FREE_QUOTA_ERROR_CODE.USER_QUOTA_EXHAUSTED) {
    return {
      statusCode: 402,
      body: {
        error: errorCode,
        nextRefillAt: nextRefillAt?.toISOString() ?? null,
        serverNow: serverNow.toISOString(),
      },
    };
  }

  return {
    statusCode: 402,
    body: {
      error: errorCode,
      serverNow: serverNow.toISOString(),
    },
  };
}

function resolveHomeExecutionForModel(
  request: Request,
  modelId: string,
  prompt: string
) {
  if (modelId !== 'gpt-image-2') {
    return {
      executableOverride: undefined,
      channelDecision: null,
    };
  }

  const decision = resolveExecutionForSurface(
    websiteConfig.generation.surfaces['home-anonymous'],
    buildExecutionContext({
      headers: request.headers,
      prompt,
    })
  );

  return {
    executableOverride: decision.executableId ?? undefined,
    channelDecision: decision.decision,
  };
}

export async function POST(request: Request) {
  let reservedIdempotencyRecordId: string | null = null;
  const t0 = performance.now();
  const lap = (label: string) =>
    console.log(
      `[home-image.submit] ${label}: +${Math.round(performance.now() - t0)}ms`
    );

  try {
    lap('start');
    if (!isSameOriginRequest(request)) {
      return jsonNoStore({ error: 'Forbidden' }, { status: 403 });
    }

    const session = await auth.api.getSession({
      headers: await headers(),
    });
    lap('auth.getSession');

    // Classic mode short-circuit: guests cannot generate at all. Surface
    // FEATURE_REQUIRES_LOGIN so the frontend opens the login modal — this
    // matches the existing handler for that errorCode in use-home-generation.
    if (isClassicCreditsMode() && !session?.user?.id) {
      return jsonNoStore(
        { error: HOME_IMAGE_ERROR.FEATURE_REQUIRES_LOGIN },
        { status: 401 }
      );
    }

    const rawBody = (await request
      .json()
      .catch(() => null)) as HomeSubmitPayload | null;

    if (!rawBody || typeof rawBody !== 'object') {
      return jsonNoStore(
        { error: HOME_IMAGE_ERROR.INVALID_PARAMS },
        { status: 400 }
      );
    }

    const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();
    if (!idempotencyKey) {
      return jsonNoStore(
        { error: HOME_IMAGE_ERROR.IDEMPOTENCY_KEY_REQUIRED },
        { status: 400 }
      );
    }

    const guestId = session?.user?.id
      ? null
      : await getVerifiedGuestId(request);
    if (!session?.user?.id && !guestId) {
      return jsonNoStore(
        { error: HOME_IMAGE_ERROR.GUEST_COOKIE_MISSING },
        { status: 400 }
      );
    }

    const derivedAbuseBindKey = session?.user?.id
      ? null
      : await deriveRequestAbuseBindKey(request);
    const subjectKey = session?.user?.id || derivedAbuseBindKey?.abuseBindKey;

    if (!subjectKey) {
      return jsonNoStore(
        { error: HOME_IMAGE_ERROR.INVALID_PARAMS },
        { status: 400 }
      );
    }

    const requestHash = await hashCanonicalJson(rawBody);
    const idempotencyReservation = await reserveHomeIdempotency({
      subjectKey,
      idempotencyKey,
      requestHash,
    });
    lap('reserveHomeIdempotency');

    if (idempotencyReservation.kind === 'payload-conflict') {
      return jsonNoStore(
        {
          error: HOME_IMAGE_ERROR.IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD,
        },
        { status: 409 }
      );
    }

    if (idempotencyReservation.kind === 'in-progress') {
      return jsonNoStore(
        { error: HOME_IMAGE_ERROR.REQUEST_IN_PROGRESS },
        { status: 409 }
      );
    }

    if (idempotencyReservation.kind === 'replay') {
      return jsonNoStore(idempotencyReservation.record.responseBody, {
        status: idempotencyReservation.record.responseCode ?? 200,
      });
    }

    reservedIdempotencyRecordId = idempotencyReservation.record.id;

    const validation = validateHomeSubmitPayload(rawBody, {
      isAuthenticated: !!session?.user?.id,
    });
    if (!validation.ok) {
      await finalizeHomeIdempotencyFailure({
        recordId: reservedIdempotencyRecordId,
        responseCode: validation.statusCode,
        responseBody: validation.body,
      });
      return jsonNoStore(validation.body, { status: validation.statusCode });
    }

    // Defense-in-depth: even if the surface allow-list accidentally
    // included a model whose ProductPolicy says `requiresAuth: true`
    // (e.g. a heavy video product), fall through to FEATURE_REQUIRES_LOGIN
    // for unauthenticated callers. The surface allow-list above is the
    // primary gate; this is the model's own physical constraint.
    if (!session?.user?.id) {
      const productModel = IMAGE_PRODUCTS.find(
        (p) => p.id === validation.value.modelId
      );
      if (productModel?.policy.requiresAuth) {
        const body = { error: HOME_IMAGE_ERROR.FEATURE_REQUIRES_LOGIN };
        await finalizeHomeIdempotencyFailure({
          recordId: reservedIdempotencyRecordId,
          responseCode: 401,
          responseBody: body,
        });
        return jsonNoStore(body, { status: 401 });
      }
    }

    if (session?.user?.id) {
      const access = await resolveHomeImageAccess({
        userId: session.user.id,
        modelId: validation.value.modelId,
        resolution: validation.value.resolution,
      });

      if (access.mode === HOME_IMAGE_ACCESS_MODE.CREDITS) {
        const delegated = await delegateToFormalImageSubmit(
          request,
          validation.value
        );

        if (delegated.ok) {
          await finalizeHomeIdempotencySuccess({
            recordId: reservedIdempotencyRecordId,
            responseCode: delegated.responseCode,
            responseBody: delegated.responseBody,
            generationKind: delegated.generationKind,
            generationId: delegated.generationId,
            providerRequestId: delegated.providerRequestId,
          });
        } else {
          await finalizeHomeIdempotencyFailure({
            recordId: reservedIdempotencyRecordId,
            responseCode: delegated.responseCode,
            responseBody: delegated.responseBody,
          });
        }

        return jsonNoStore(delegated.responseBody, {
          status: delegated.responseCode,
        });
      }

      if (access.mode === HOME_IMAGE_ACCESS_MODE.PURCHASE_REQUIRED) {
        const body = {
          error: HOME_IMAGE_ERROR.PAID_USER_NO_CREDITS,
          serverNow: new Date().toISOString(),
        };
        await finalizeHomeIdempotencyFailure({
          recordId: reservedIdempotencyRecordId,
          responseCode: 402,
          responseBody: body,
        });
        return jsonNoStore(body, { status: 402 });
      }

      const quotaConsumption = await consumeFreeQuota({
        subjectType: FREE_QUOTA_SUBJECT_TYPE.USER,
        userId: session.user.id,
      });

      if (!quotaConsumption.ok || !quotaConsumption.bucket) {
        const serverNow = new Date();
        trackServerEvent('free_quota_cooldown_hit', {
          userId: session.user.id,
          subjectType: 'user',
          errorCode: quotaConsumption.errorCode,
          nextRefillAt: quotaConsumption.nextRefillAt?.toISOString() ?? null,
        });
        const quotaError = buildQuotaErrorResponse(
          quotaConsumption.errorCode,
          quotaConsumption.nextRefillAt,
          serverNow
        );
        await finalizeHomeIdempotencyFailure({
          recordId: reservedIdempotencyRecordId,
          responseCode: quotaError.statusCode,
          responseBody: quotaError.body,
        });
        return jsonNoStore(quotaError.body, { status: quotaError.statusCode });
      }

      const execution = resolveHomeExecutionForModel(
        request,
        validation.value.modelId,
        validation.value.prompt
      );

      const freeSubmitResult = await submitHomeFreeGeneration({
        request,
        subjectType: 'user',
        userId: session.user.id,
        payload: validation.value,
        quotaBucketId: quotaConsumption.bucket.id,
        executableOverride: execution.executableOverride,
        channelDecision: execution.channelDecision,
      });

      if (!freeSubmitResult.ok) {
        if (freeSubmitResult.safeToRefund) {
          await refundFreeQuota({ bucketId: quotaConsumption.bucket.id });
        }

        await finalizeHomeIdempotencyFailure({
          recordId: reservedIdempotencyRecordId,
          responseCode: freeSubmitResult.responseCode,
          responseBody: freeSubmitResult.responseBody,
          generationKind: freeSubmitResult.generationKind,
          generationId: freeSubmitResult.generationId ?? null,
          providerRequestId: freeSubmitResult.providerRequestId ?? null,
        });

        return jsonNoStore(freeSubmitResult.responseBody, {
          status: freeSubmitResult.responseCode,
        });
      }

      await finalizeHomeIdempotencySuccess({
        recordId: reservedIdempotencyRecordId,
        responseCode: freeSubmitResult.responseCode,
        responseBody: freeSubmitResult.responseBody,
        generationKind: freeSubmitResult.generationKind,
        generationId: freeSubmitResult.generationId,
        providerRequestId: freeSubmitResult.providerRequestId,
      });

      return jsonNoStore(freeSubmitResult.responseBody, {
        status: freeSubmitResult.responseCode,
      });
    }

    const serverNow = new Date();

    // Peek quota + visitor-risk signal, then gate with captcha before
    // we consume a free slot. Gating BEFORE the atomic decrement means
    // a 428 response does not cost the user a quota — retry with a
    // valid captcha token still lands on the same remaining count.
    const quotaPeek = await getFreeQuotaStatus({
      subjectType: FREE_QUOTA_SUBJECT_TYPE.GUEST,
      derivedAbuseBindKey: derivedAbuseBindKey!,
      visitorIdRiskSignal: getVisitorIdRiskSignal(
        request,
        validation.value.visitorId
      ),
      createIfMissing: false,
      now: serverNow,
    });

    const visitorRisk = await evaluateVisitorRisk({
      visitorId: validation.value.visitorId,
      now: serverNow,
    });

    if (
      requiresSubmitCaptcha({
        isGuest: true,
        remaining: quotaPeek.remaining,
        visitorAnomaly: visitorRisk.anomalous,
      })
    ) {
      const captchaOutcome = await verifySubmitCaptcha({
        subjectKey: `guest:${derivedAbuseBindKey!.abuseBindKey}`,
        captchaToken: validation.value.captchaToken,
      });

      if (captchaOutcome.kind === 'failure-bucket-exhausted') {
        const body = {
          error: 'RATE_LIMITED',
          serverNow: serverNow.toISOString(),
        };
        await finalizeHomeIdempotencyFailure({
          recordId: reservedIdempotencyRecordId,
          responseCode: 429,
          responseBody: body,
        });
        return jsonNoStore(body, {
          status: 429,
          headers: {
            'Retry-After': String(captchaOutcome.retryAfterSeconds),
          },
        });
      }

      if (captchaOutcome.kind === 'challenge-required') {
        const body = {
          error: captchaOutcome.reason,
          captchaRequired: true,
          siteKey: captchaOutcome.siteKey ?? captchaSiteKey(),
          serverNow: serverNow.toISOString(),
        };
        await finalizeHomeIdempotencyFailure({
          recordId: reservedIdempotencyRecordId,
          responseCode: 428,
          responseBody: body,
        });
        return jsonNoStore(body, { status: 428 });
      }
    }

    const quotaConsumption = await consumeFreeQuota({
      subjectType: FREE_QUOTA_SUBJECT_TYPE.GUEST,
      derivedAbuseBindKey: derivedAbuseBindKey!,
      visitorIdRiskSignal: getVisitorIdRiskSignal(
        request,
        validation.value.visitorId
      ),
    });
    lap('consumeFreeQuota(guest)');

    if (!quotaConsumption.ok || !quotaConsumption.bucket) {
      trackServerEvent('free_quota_cooldown_hit', {
        userId: null,
        subjectType: 'guest',
        errorCode: quotaConsumption.errorCode,
        fingerprint: validation.value.visitorId ?? null,
        nextRefillAt: quotaConsumption.nextRefillAt?.toISOString() ?? null,
      });
      const quotaError = buildQuotaErrorResponse(
        quotaConsumption.errorCode,
        quotaConsumption.nextRefillAt,
        serverNow
      );
      await finalizeHomeIdempotencyFailure({
        recordId: reservedIdempotencyRecordId,
        responseCode: quotaError.statusCode,
        responseBody: quotaError.body,
      });
      return jsonNoStore(quotaError.body, { status: quotaError.statusCode });
    }

    const execution = resolveHomeExecutionForModel(
      request,
      validation.value.modelId,
      validation.value.prompt
    );

    const freeSubmitResult = await submitHomeFreeGeneration({
      request,
      subjectType: 'guest',
      guestId: guestId!,
      abuseBindKeySnapshot: derivedAbuseBindKey!.abuseBindKey,
      payload: validation.value,
      quotaBucketId: quotaConsumption.bucket.id,
      executableOverride: execution.executableOverride,
      channelDecision: execution.channelDecision,
    });
    lap('submitHomeFreeGeneration(guest)');

    if (!freeSubmitResult.ok) {
      if (freeSubmitResult.safeToRefund) {
        await refundFreeQuota({ bucketId: quotaConsumption.bucket.id });
      }

      await finalizeHomeIdempotencyFailure({
        recordId: reservedIdempotencyRecordId,
        responseCode: freeSubmitResult.responseCode,
        responseBody: freeSubmitResult.responseBody,
        generationKind: freeSubmitResult.generationKind,
        generationId: freeSubmitResult.generationId ?? null,
        providerRequestId: freeSubmitResult.providerRequestId ?? null,
      });

      return jsonNoStore(freeSubmitResult.responseBody, {
        status: freeSubmitResult.responseCode,
      });
    }

    await finalizeHomeIdempotencySuccess({
      recordId: reservedIdempotencyRecordId,
      responseCode: freeSubmitResult.responseCode,
      responseBody: freeSubmitResult.responseBody,
      generationKind: freeSubmitResult.generationKind,
      generationId: freeSubmitResult.generationId,
      providerRequestId: freeSubmitResult.providerRequestId,
    });

    return jsonNoStore(freeSubmitResult.responseBody, {
      status: freeSubmitResult.responseCode,
    });
  } catch (error) {
    console.error('[home-image.submit] unexpected error:', error);

    if (reservedIdempotencyRecordId) {
      await finalizeHomeIdempotencyFailure({
        recordId: reservedIdempotencyRecordId,
        responseCode: 500,
        responseBody: { error: 'Internal server error' },
      }).catch((finalizeError) => {
        console.error(
          '[home-image.submit] failed to finalize idempotency after crash:',
          finalizeError
        );
      });
    }

    return jsonNoStore({ error: 'Internal server error' }, { status: 500 });
  }
}
