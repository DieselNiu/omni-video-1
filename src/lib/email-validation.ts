import { getDb } from '@/db/index';
import { user } from '@/db/schema';
import { ilike, or } from 'drizzle-orm';
import MailChecker from 'mailchecker';

/**
 * Custom blocklist for disposable/temporary email domains
 * that mailchecker doesn't recognize yet.
 * Add new domains here as they are discovered.
 */
const CUSTOM_DISPOSABLE_DOMAINS = new Set([
  // Discovered 2026-03-18: bulk signup abuse
  'onbap.com',
  'sharebot.net',
  'minitts.net',
  'emailax.pro',
  'qvmao.com',
  'paylaar.com',
  'pazard.com',
  'soco7.com',
  'hidingmail.com',
  'dollicons.com',
  'fentaoba.com',
  'pazuric.com',
  'ostahie.com',
  'duoley.com',
  'mamabood.com',
  'ussteel.xyz',
  'aniimate.net',
  'denipl.net',
  'sweatpopi.com',
  'dropmeon.com',
  'disposableinbox.xyz',
  'rommiui.com',
  'toneke.com',
  'p2pshare.com',
  'tsespren.com',
  'bola.mom',
  'poketani.nl',
  'oeralb.com',
  'chatgptemail.online',
  'lambdairon.com',
  'tiffincrane.com',
  'melbourne.edu.pl',
  'lxbeta.com',
  'tuunic.com',
  'isfew.com',
  '3dkai.com',
  'mailnestpro.com',
]);

/**
 * Check if the email is from a disposable/temporary email provider
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (domain && CUSTOM_DISPOSABLE_DOMAINS.has(domain)) {
    return true;
  }
  return !MailChecker.isValid(email);
}

/**
 * Check if a Gmail/Googlemail address has suspicious patterns:
 * - Contains '+' alias (e.g. user+tag@gmail.com)
 * - Excessive dots in local part (e.g. g.a.l.l.g.r.i.c.e.l.a@gmail.com)
 *
 * Normal Gmail: john.smith@gmail.com (1 dot)
 * Suspicious:   h.a.s.n.e.s.l.a.m@gmail.com (8 dots, single-char segments)
 */
export function isSuspiciousGmail(email: string): boolean {
  const [localPart, domain] = email.toLowerCase().split('@');
  if (!localPart || !domain) return false;

  const isGmail = domain === 'gmail.com' || domain === 'googlemail.com';
  if (!isGmail) return false;

  // Block '+' aliases — no legitimate reason for first-time signup
  if (localPart.includes('+')) return true;

  // Count dots — normal addresses rarely have more than 2 (first.middle.last)
  const dotCount = (localPart.match(/\./g) || []).length;
  if (dotCount >= 4) return true;

  // Detect single-char segments between dots (e.g. "a.b.c.d")
  // 3+ such segments is a strong abuse signal
  const segments = localPart.split('.');
  const shortSegments = segments.filter((s) => s.length <= 1).length;
  if (shortSegments >= 3) return true;

  return false;
}

/**
 * Normalize Gmail address: remove dots and +alias
 * Returns non-Gmail addresses unchanged
 */
export function normalizeGmailAddress(email: string): string {
  const [localPart, domain] = email.toLowerCase().split('@');
  if (!localPart || !domain) return email.toLowerCase();

  const isGmail = domain === 'gmail.com' || domain === 'googlemail.com';
  if (!isGmail) return email.toLowerCase();

  // Remove everything after +
  const withoutPlus = localPart.split('+')[0];
  // Remove all dots
  const withoutDots = withoutPlus.replace(/\./g, '');

  return `${withoutDots}@gmail.com`;
}

/**
 * Check if a normalized version of the email already has an existing account
 */
export async function checkNormalizedEmailExists(
  email: string
): Promise<boolean> {
  const normalized = normalizeGmailAddress(email);
  const [, domain] = email.toLowerCase().split('@');

  const isGmail = domain === 'gmail.com' || domain === 'googlemail.com';
  if (!isGmail) return false;

  const db = await getDb();
  const gmailUsers = await db
    .select({ email: user.email })
    .from(user)
    .where(
      or(
        ilike(user.email, '%@gmail.com'),
        ilike(user.email, '%@googlemail.com')
      )
    );

  const inputEmailLower = email.toLowerCase();
  for (const existingUser of gmailUsers) {
    if (normalizeGmailAddress(existingUser.email) === normalized) {
      // Exact same email = same user trying to sign in, allow it
      if (existingUser.email.toLowerCase() === inputEmailLower) {
        return false;
      }
      // Different email alias that normalizes to the same address = duplicate
      return true;
    }
  }

  return false;
}
