import { routing } from '@/i18n/routing';
import type { Locale } from 'next-intl';

const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL ??
  `http://localhost:${process.env.PORT ?? 3000}`;

/**
 * Get the base URL of the application
 */
export function getBaseUrl(): string {
  return baseUrl;
}

/**
 * Ensure a URL ends with a trailing slash (avoids double slashes)
 */
export function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * Build a webhook/callback URL that survives Next.js `trailingSlash: true`.
 * Without the trailing slash, upstream POSTs (Kie, MaxAPI, etc.) hit a 308
 * redirect that most webhook clients don't follow — the route handler never
 * runs, the task stays stuck in PROCESSING, and credits are not refunded.
 */
export function buildWebhookUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return ensureTrailingSlash(`${normalizedBase}${normalizedPath}`);
}

/**
 * Check if the locale should be appended to the URL
 */
export function shouldAppendLocale(locale?: Locale | null): boolean {
  return !!locale && locale !== routing.defaultLocale && locale !== 'default';
}

/**
 * Get the URL of the application with the locale appended
 * Always includes trailing slash to match trailingSlash: true in next.config.ts
 */
export function getUrlWithLocale(url: string, locale?: Locale | null): string {
  const path = url === '/' ? '' : url;

  let result: string;
  if (shouldAppendLocale(locale)) {
    result = `${baseUrl}/${locale}${path}`;
  } else {
    result = path ? `${baseUrl}${path}` : baseUrl;
  }

  return ensureTrailingSlash(result);
}

/**
 * Adds locale to the callbackURL parameter in authentication URLs
 *
 * Example:
 * Input: http://localhost:3000/api/auth/reset-password/token?callbackURL=/auth/reset-password
 * Output: http://localhost:3000/api/auth/reset-password/token?callbackURL=/zh/auth/reset-password
 *
 * Input: http://localhost:3000/api/auth/verify-email?token=eyJhbGciOiJIUzI1NiJ9&callbackURL=/dashboard
 * Output: http://localhost:3000/api/auth/verify-email?token=eyJhbGciOiJIUzI1NiJ9&callbackURL=/zh/dashboard
 *
 * @param url - The original URL with callbackURL parameter
 * @param locale - The locale to add to the callbackURL
 * @returns The URL with locale added to callbackURL if necessary
 */
export function getUrlWithLocaleInCallbackUrl(
  url: string,
  locale: Locale
): string {
  // If we shouldn't append locale, return original URL
  if (!shouldAppendLocale(locale)) {
    return url;
  }

  try {
    // Parse the URL
    const urlObj = new URL(url);

    // Check if there's a callbackURL parameter
    const callbackURL = urlObj.searchParams.get('callbackURL');

    if (callbackURL) {
      // Only modify the callbackURL if it doesn't already include the locale
      if (!callbackURL.match(new RegExp(`^/${locale}(/|$)`))) {
        // Add locale to the callbackURL
        const localizedCallbackURL = callbackURL.startsWith('/')
          ? `/${locale}${callbackURL}`
          : `/${locale}/${callbackURL}`;

        // Update the search parameter
        urlObj.searchParams.set('callbackURL', localizedCallbackURL);
      }
    }

    return urlObj.toString();
  } catch (error) {
    // If URL parsing fails, return the original URL
    console.warn('Failed to parse URL for locale insertion:', url, error);
    return url;
  }
}

/**
 * Get the URL of the image, if the image is a relative path, it will be prefixed with the base URL
 * @param image - The image URL
 * @returns The URL of the image
 */
export function getImageUrl(image: string): string {
  if (image.startsWith('http://') || image.startsWith('https://')) {
    return image;
  }
  if (image.startsWith('/')) {
    return `${getBaseUrl()}${image}`;
  }
  return `${getBaseUrl()}/${image}`;
}

/**
 * Get the Stripe dashboard customer URL
 * @param customerId - The Stripe customer ID
 * @returns The Stripe dashboard customer URL
 */
export function getStripeDashboardCustomerUrl(customerId: string): string {
  if (process.env.NODE_ENV === 'development') {
    return `https://dashboard.stripe.com/test/customers/${customerId}`;
  }
  return `https://dashboard.stripe.com/customers/${customerId}`;
}
