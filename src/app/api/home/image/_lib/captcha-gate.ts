import { websiteConfig } from '@/config/website';
import { validateTurnstileToken } from '@/lib/captcha';
import { checkAndIncrementRateLimit } from '@/storage/rate-limit';

// Home image submit captcha thresholds: configured via
// websiteConfig.credits.guestCaptchaThreshold{,Anomalous}. Defaults
// (5 free / threshold 2 / anomalous 4) mean a normal guest sees captcha
// on the last 2 of 5, and an anomalous guest sees it after the 1st.
// When `guestFreeRequests` is changed, drop the thresholds proportionally
// or new users will hit captcha on their very first generation.

// Failure-bucket protection: each invalid/missing captcha submission
// burns one slot in a dedicated counter so a script cannot loop 428
// responses at zero compute cost. Well above any legit human's retry
// rate; below what an unattended bot would rack up in one window.
const CAPTCHA_FAILURE_WINDOW_SECONDS = 60;
const CAPTCHA_FAILURE_MAX = 60;

export function captchaEnabled(): boolean {
  // Require BOTH keys to be present — without the public site key the
  // client renders a blank dialog and the user can't solve the
  // challenge, so we'd rather fail open (no gate) than issue an
  // unsolvable 428.
  return (
    websiteConfig.features.enableTurnstileCaptcha === true &&
    !!process.env.TURNSTILE_SECRET_KEY &&
    !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  );
}

export function captchaSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null;
}

/**
 * Decide whether this submission must present a captcha. Applies only
 * to guests when Turnstile is enabled; logged-in users are bounded by
 * their own quota and never see 428.
 */
export function requiresSubmitCaptcha(params: {
  isGuest: boolean;
  remaining: number;
  visitorAnomaly: boolean;
}): boolean {
  if (!params.isGuest || !captchaEnabled()) return false;
  const threshold = params.visitorAnomaly
    ? websiteConfig.credits.guestCaptchaThresholdAnomalous
    : websiteConfig.credits.guestCaptchaThreshold;
  // Only gate when the bucket actually has capacity left; if it's
  // already exhausted the caller will return the usual quota error
  // and captcha isn't a bypass.
  return params.remaining > 0 && params.remaining <= threshold;
}

export type CaptchaGateOutcome =
  | { kind: 'allowed' }
  | {
      kind: 'challenge-required';
      reason: 'captcha_required' | 'captcha_invalid';
      siteKey: string | null;
    }
  | {
      kind: 'failure-bucket-exhausted';
      retryAfterSeconds: number;
    };

/**
 * Verify a submitted captcha token (or the lack thereof). On every
 * missing/invalid outcome we burn the failure bucket — if it fills up
 * for this subject in the current window, the caller should reply 429
 * instead of 428 so scripted abuse stops receiving soft challenges.
 */
export async function verifySubmitCaptcha(params: {
  subjectKey: string;
  captchaToken: string | null;
}): Promise<CaptchaGateOutcome> {
  if (params.captchaToken) {
    const valid = await validateTurnstileToken(params.captchaToken);
    if (valid) {
      return { kind: 'allowed' };
    }
  }

  const failureBucket = await checkAndIncrementRateLimit({
    subjectKey: params.subjectKey,
    intent: 'home-image-submit:captcha-fail',
    limit: {
      windowSeconds: CAPTCHA_FAILURE_WINDOW_SECONDS,
      max: CAPTCHA_FAILURE_MAX,
    },
  });

  if (!failureBucket.allowed) {
    return {
      kind: 'failure-bucket-exhausted',
      retryAfterSeconds: failureBucket.retryAfterSeconds,
    };
  }

  return {
    kind: 'challenge-required',
    reason: params.captchaToken ? 'captcha_invalid' : 'captcha_required',
    siteKey: captchaSiteKey(),
  };
}
