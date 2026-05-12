import {
  type DerivedAbuseBindKey,
  deriveAbuseBindKey,
} from '@/credits/free-quota';
import {
  getGuestCookieName,
  verifyGuestCookieValue,
} from '@/lib/home-image-security';
import { getBaseUrl } from '@/lib/urls/urls';

const ALLOWED_SEC_FETCH_SITE = new Set(['same-origin', 'same-site']);

/**
 * Same-origin guard for endpoints that should only be called from our
 * own web UI. Checks Sec-Fetch-Site, Origin, then Referer as a chain
 * of increasingly lenient sources. Identical shape to the upload
 * route's check so tests that pass one pass both.
 */
export function isSameOriginRequest(request: Request): boolean {
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite && !ALLOWED_SEC_FETCH_SITE.has(secFetchSite)) {
    return false;
  }

  const expectedOrigin = (() => {
    try {
      return new URL(getBaseUrl()).origin;
    } catch {
      return null;
    }
  })();
  if (!expectedOrigin) {
    return false;
  }

  const originHeader = request.headers.get('origin');
  if (originHeader) {
    return originHeader === expectedOrigin;
  }

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  return false;
}

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const [cookieName, ...rest] = part.trim().split('=');
    if (cookieName === name) {
      return rest.join('=') || null;
    }
  }

  return null;
}

function getIpAddress(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')
  );
}

export async function getVerifiedGuestId(request: Request) {
  const guestCookieValue = getCookieValue(
    request.headers.get('cookie'),
    getGuestCookieName()
  );
  const payload = await verifyGuestCookieValue(guestCookieValue);
  return payload?.id ?? null;
}

export async function deriveRequestAbuseBindKey(
  request: Request
): Promise<DerivedAbuseBindKey> {
  return deriveAbuseBindKey({
    ipAddress: getIpAddress(request),
    userAgent: request.headers.get('user-agent'),
    acceptLanguage: request.headers.get('accept-language'),
  });
}

export function getVisitorIdRiskSignal(
  request: Request,
  visitorId?: unknown
): string | null {
  if (typeof visitorId === 'string' && visitorId.trim()) {
    return visitorId.trim().slice(0, 512);
  }

  const headerValue = request.headers.get('x-visitor-id');
  return headerValue?.trim() ? headerValue.trim().slice(0, 512) : null;
}

export function buildInternalRouteUrl(request: Request, pathname: string) {
  return new URL(pathname, request.url).toString();
}

export function buildWebhookUrl(request: Request) {
  const baseUrl =
    process.env.WEBHOOK_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    new URL(request.url).origin;
  const url = new URL('/api/image-generation/webhook/maxapi', baseUrl);
  const webhookSecret = process.env.MAXAPI_WEBHOOK_SECRET;

  if (webhookSecret) {
    url.searchParams.set('token', webhookSecret);
  }

  return url.toString();
}
