import { hmacSha256Hex } from '@/lib/home-image-security';

export const UPLOAD_CAPTCHA_COOKIE_NAME = 'upload_captcha_ok';

interface CookiePayload {
  subjectKey: string;
  windowEnd: number;
}

function encodePayload(payload: CookiePayload): string {
  return `${payload.subjectKey}|${payload.windowEnd}`;
}

function getSecret(): string | null {
  return process.env.UPLOAD_CAPTCHA_COOKIE_SECRET ?? null;
}

export async function signCaptchaCookie(
  payload: CookiePayload
): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  const encoded = encodePayload(payload);
  const signature = await hmacSha256Hex(secret, encoded);
  return `${encoded}|${signature}`;
}

export async function verifyCaptchaCookie(
  raw: string | null,
  expected: CookiePayload
): Promise<boolean> {
  if (!raw) return false;
  const secret = getSecret();
  if (!secret) return false;

  const parts = raw.split('|');
  if (parts.length !== 3) return false;

  const [subjectKey, windowEndRaw, signature] = parts;
  const windowEnd = Number.parseInt(windowEndRaw, 10);
  if (!Number.isFinite(windowEnd)) return false;

  if (subjectKey !== expected.subjectKey) return false;
  if (windowEnd !== expected.windowEnd) return false;

  const encoded = encodePayload({ subjectKey, windowEnd });
  const computed = await hmacSha256Hex(secret, encoded);
  return timingSafeEqual(computed, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function readCookieFromHeader(
  cookieHeader: string | null,
  name: string
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [cookieName, ...rest] = part.trim().split('=');
    if (cookieName === name) {
      return rest.join('=') || null;
    }
  }
  return null;
}
