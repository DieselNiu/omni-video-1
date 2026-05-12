const GUEST_COOKIE_NAME = 'guest_id';
const GUEST_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const HMAC_SHA_256 = { name: 'HMAC', hash: 'SHA-256' } as const;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export interface GuestCookiePayload {
  id: string;
  issuedAt: number;
}

export interface AbuseBindSignals {
  abuseBindKey: string;
  ipPrefixHash: string;
  uaHash: string;
  locale: string;
  degraded: boolean;
  visitorIdRiskSignal: string | null;
}

interface HeaderReader {
  get(name: string): string | null;
}

function getRequiredSecret(
  name: 'ABUSE_BIND_SECRET' | 'GUEST_ID_SIGNING_SECRET'
) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for home image security flows`);
  }
  return value;
}

function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    ''
  );
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding =
    normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    TEXT_ENCODER.encode(secret),
    HMAC_SHA_256,
    false,
    ['sign']
  );
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    TEXT_ENCODER.encode(input)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

export async function hmacSha256Hex(
  secret: string,
  input: string
): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    HMAC_SHA_256.name,
    key,
    TEXT_ENCODER.encode(input)
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function normalizeLocale(acceptLanguage: string | null): string {
  const primary = acceptLanguage?.split(',')[0]?.trim();
  if (!primary) return 'und';

  const [languageRaw, regionRaw] = primary.split(';')[0].split('-');
  const language = languageRaw?.trim().toLowerCase();
  const region = regionRaw?.trim().toUpperCase();

  if (!language) return 'und';
  return region ? `${language}-${region}` : language;
}

function normalizeUserAgentSignature(userAgent: string | null): string {
  if (!userAgent) return 'unknown/0|unknown';

  const lower = userAgent.toLowerCase();
  const browserVersion = /edg\/(\d+)/i.exec(userAgent)?.[1]
    ? `edge/${/edg\/(\d+)/i.exec(userAgent)?.[1]}`
    : /chrome\/(\d+)/i.exec(userAgent)?.[1]
      ? `chrome/${/chrome\/(\d+)/i.exec(userAgent)?.[1]}`
      : /firefox\/(\d+)/i.exec(userAgent)?.[1]
        ? `firefox/${/firefox\/(\d+)/i.exec(userAgent)?.[1]}`
        : /version\/(\d+).+safari/i.exec(userAgent)?.[1]
          ? `safari/${/version\/(\d+).+safari/i.exec(userAgent)?.[1]}`
          : 'unknown/0';

  const os =
    lower.includes('iphone') || lower.includes('ipad')
      ? 'ios'
      : lower.includes('android')
        ? 'android'
        : lower.includes('mac os x')
          ? 'macos'
          : lower.includes('windows')
            ? 'windows'
            : lower.includes('linux')
              ? 'linux'
              : 'unknown';

  return `${browserVersion}|${os}`;
}

function normalizeIpv4Prefix(ip: string): string | null {
  const match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (!match) return null;
  return `${match[1]}.${match[2]}.${match[3]}.0/24`;
}

function normalizeIpv6Prefix(ip: string): string | null {
  const withoutZone = ip.split('%')[0];
  const parts = withoutZone.split('::');

  const left = parts[0] ? parts[0].split(':').filter(Boolean) : [];
  const right = parts[1] ? parts[1].split(':').filter(Boolean) : [];

  if (parts.length > 2) return null;

  const missing = 8 - (left.length + right.length);
  if (missing < 0) return null;

  const expanded = [
    ...left,
    ...new Array(parts.length === 2 ? missing : 0).fill('0'),
    ...right,
  ].map((segment) => segment.padStart(4, '0'));

  if (expanded.length !== 8) return null;

  return `${expanded.slice(0, 3).join(':')}::/48`;
}

function getClientIp(headers: HeaderReader): string | null {
  const forwarded =
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    headers.get('x-forwarded-for');

  if (!forwarded) return null;
  return forwarded.split(',')[0]?.trim() || null;
}

export function deriveIpPrefix(headers: HeaderReader): string {
  const ip = getClientIp(headers);
  if (!ip) return 'unknown';

  const ipv4 = normalizeIpv4Prefix(ip);
  if (ipv4) return ipv4;

  const ipv6 = normalizeIpv6Prefix(ip);
  if (ipv6) return ipv6;

  return 'unknown';
}

export async function deriveAbuseBindSignals(
  headers: HeaderReader
): Promise<AbuseBindSignals> {
  const ipPrefix = deriveIpPrefix(headers);
  const uaSignature = normalizeUserAgentSignature(headers.get('user-agent'));
  const locale = normalizeLocale(headers.get('accept-language'));
  const visitorIdRiskSignal = headers.get('x-visitor-id');

  const input = [ipPrefix, uaSignature, locale].join('\x1F');
  const secret = getRequiredSecret('ABUSE_BIND_SECRET');

  return {
    abuseBindKey: await hmacSha256Hex(secret, input),
    ipPrefixHash: await sha256Hex(ipPrefix),
    uaHash: await sha256Hex(uaSignature),
    locale,
    degraded: ipPrefix === 'unknown' || uaSignature === 'unknown/0|unknown',
    visitorIdRiskSignal,
  };
}

export async function createGuestCookieValue(
  payload: GuestCookiePayload = {
    id: crypto.randomUUID(),
    issuedAt: Date.now(),
  }
): Promise<string> {
  const encodedPayload = toBase64Url(
    TEXT_ENCODER.encode(JSON.stringify(payload))
  );
  const signature = await hmacSha256Hex(
    getRequiredSecret('GUEST_ID_SIGNING_SECRET'),
    encodedPayload
  );

  return `${encodedPayload}.${signature}`;
}

export async function verifyGuestCookieValue(
  value: string | undefined | null
): Promise<GuestCookiePayload | null> {
  if (!value) return null;

  const [encodedPayload, signature] = value.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = await hmacSha256Hex(
    getRequiredSecret('GUEST_ID_SIGNING_SECRET'),
    encodedPayload
  );

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const decoded = TEXT_DECODER.decode(fromBase64Url(encodedPayload));
    const parsed = JSON.parse(decoded) as Partial<GuestCookiePayload>;
    if (!parsed.id || !parsed.issuedAt) {
      return null;
    }

    return {
      id: parsed.id,
      issuedAt: parsed.issuedAt,
    };
  } catch {
    return null;
  }
}

export function getGuestCookieName() {
  return GUEST_COOKIE_NAME;
}

export function getGuestCookieMaxAgeSeconds() {
  return GUEST_COOKIE_MAX_AGE_SECONDS;
}
