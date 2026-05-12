import {
  deriveRequestAbuseBindKey,
  getVerifiedGuestId,
  isSameOriginRequest,
} from '@/app/api/home/image/_lib/request';
import { websiteConfig } from '@/config/website';
import { auth } from '@/lib/auth';
import { validateTurnstileToken } from '@/lib/captcha';
import { uploadFile } from '@/storage';
import {
  UPLOAD_CAPTCHA_COOKIE_NAME,
  readCookieFromHeader,
  signCaptchaCookie,
  verifyCaptchaCookie,
} from '@/storage/captcha-cookie';
import {
  type UploadIntent,
  getUploadIntentConfig,
  isUploadIntent,
} from '@/storage/intents';
import {
  checkAndIncrementRateLimit,
  peekRateLimitCount,
} from '@/storage/rate-limit';
import { StorageError } from '@/storage/types';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

// Cap for burn attempts against the captcha gate. Well above any legit
// user's retry pattern (misclick/wrong puzzle), but low enough that an
// unattended script exhausts its window and falls through to 429.
const CAPTCHA_FAILURE_WINDOW_SECONDS = 60;
const CAPTCHA_FAILURE_MAX = 60;

function captchaEnabled(): boolean {
  return (
    websiteConfig.features.enableTurnstileCaptcha === true &&
    !!process.env.TURNSTILE_SECRET_KEY
  );
}

function captchaSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null;
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const intentRaw = formData.get('intent');
    const captchaTokenRaw = formData.get('captchaToken');

    if (!isUploadIntent(intentRaw)) {
      return NextResponse.json(
        { error: 'Invalid or missing intent' },
        { status: 400 }
      );
    }

    const intent: UploadIntent = intentRaw;
    const intentConfig = getUploadIntentConfig(intent);

    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id ?? null;

    let subjectKey: string | null = null;
    let isGuest = false;
    if (userId) {
      subjectKey = `user:${userId}`;
    } else {
      if (intentConfig.auth === 'session') {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      const guestId = await getVerifiedGuestId(request);
      if (!guestId) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      const derived = await deriveRequestAbuseBindKey(request);
      subjectKey = `guest:${derived.abuseBindKey}`;
      isGuest = true;
    }

    // Captcha gate runs BEFORE the atomic increment so a 428 response
    // does not consume a rate-limit slot. Only guest subjects are
    // challenged today — logged-in users are bounded by the hard rate
    // limit and the dashboard upload surfaces have not been wired
    // through the captcha-aware client yet.
    const captchaIsEnabled = captchaEnabled();
    let freshCaptchaToken: string | null = null;
    let cookiePayload: { subjectKey: string; windowEnd: number } | null = null;

    if (captchaIsEnabled && isGuest) {
      const peek = await peekRateLimitCount({
        subjectKey,
        intent,
        windowSeconds: intentConfig.rateLimit.windowSeconds,
      });
      const thresholdCount = Math.max(
        1,
        Math.floor(
          intentConfig.rateLimit.max * intentConfig.rateLimit.captchaThreshold
        )
      );

      if (peek.count >= thresholdCount) {
        cookiePayload = {
          subjectKey,
          windowEnd: peek.windowEnd,
        };

        const cookieValue = readCookieFromHeader(
          request.headers.get('cookie'),
          UPLOAD_CAPTCHA_COOKIE_NAME
        );
        const cookieOk = await verifyCaptchaCookie(cookieValue, cookiePayload);

        if (!cookieOk) {
          const submittedToken =
            typeof captchaTokenRaw === 'string' && captchaTokenRaw
              ? captchaTokenRaw
              : null;

          let failureReason: 'captcha_required' | 'captcha_invalid' | null =
            null;

          if (!submittedToken) {
            failureReason = 'captcha_required';
          } else {
            const captchaValid = await validateTurnstileToken(submittedToken);
            if (!captchaValid) {
              failureReason = 'captcha_invalid';
            } else {
              freshCaptchaToken = submittedToken;
            }
          }

          if (failureReason) {
            // Charge this miss against a dedicated failure bucket so a
            // script can't loop 428 responses at no cost. The bucket is
            // separate from the upload rate-limit, so a legitimate user
            // mis-solving a challenge doesn't consume their real quota.
            const failureBucket = await checkAndIncrementRateLimit({
              subjectKey,
              intent: `${intent}:captcha-fail`,
              limit: {
                windowSeconds: CAPTCHA_FAILURE_WINDOW_SECONDS,
                max: CAPTCHA_FAILURE_MAX,
              },
            });

            if (!failureBucket.allowed) {
              return NextResponse.json(
                { error: 'Too many uploads, please try again shortly' },
                {
                  status: 429,
                  headers: {
                    'Retry-After': String(failureBucket.retryAfterSeconds),
                  },
                }
              );
            }

            return NextResponse.json(
              {
                error: failureReason,
                captchaRequired: true,
                siteKey: captchaSiteKey(),
              },
              { status: 428 }
            );
          }
        }
      }
    }

    const rateLimit = await checkAndIncrementRateLimit({
      subjectKey,
      intent,
      limit: intentConfig.rateLimit,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many uploads, please try again shortly' },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > intentConfig.maxFileSize) {
      return NextResponse.json(
        { error: 'File size exceeds the server limit' },
        { status: 400 }
      );
    }

    if (!intentConfig.allowedMimeTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type not supported' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let destinationFolder = intentConfig.folder;
    if (intentConfig.pathScope === 'userId') {
      if (!userId) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      destinationFolder = `${intentConfig.folder}/${userId}`;
    }

    const result = await uploadFile(
      buffer,
      file.name,
      file.type,
      destinationFolder
    );

    const response = NextResponse.json(result);

    if (freshCaptchaToken && cookiePayload) {
      const signed = await signCaptchaCookie(cookiePayload);
      if (signed) {
        const maxAge = Math.max(
          1,
          Math.ceil((cookiePayload.windowEnd - Date.now()) / 1000)
        );
        response.cookies.set({
          name: UPLOAD_CAPTCHA_COOKIE_NAME,
          value: signed,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/api/storage/upload/',
          maxAge,
        });
      }
    }

    return response;
  } catch (error) {
    console.error('Error uploading file:', error);

    if (error instanceof StorageError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: 'Something went wrong while uploading the file' },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
  maxDuration: 30,
};
