import { websiteConfig } from '@/config/website';
import { betterFetch } from '@better-fetch/fetch';
import type { Locale } from 'next-intl';
import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { DEFAULT_LOCALE, LOCALES, routing } from './i18n/routing';
import type { Session } from './lib/auth-types';
import { blogLocalesBySlug } from './lib/blog-locale-map';
import {
  createGuestCookieValue,
  getGuestCookieMaxAgeSeconds,
  getGuestCookieName,
  verifyGuestCookieValue,
} from './lib/home-image-security';
import { getBaseUrl } from './lib/urls/urls';
import {
  DEFAULT_LOGIN_REDIRECT,
  protectedRoutes,
  routesNotAllowedByLoggedInUsers,
} from './routes';

const intlMiddleware = createMiddleware(routing);
const ENGLISH_ONLY_ROUTES = ['/cookie', '/privacy', '/terms'];

// Better Auth default cookie names (no custom prefix configured)
const AUTH_SESSION_COOKIES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
];

function hasAuthSessionCookie(req: NextRequest): boolean {
  return AUTH_SESSION_COOKIES.some((name) => Boolean(req.cookies.get(name)));
}

/**
 * 1. Next.js middleware
 * https://nextjs.org/docs/app/building-your-application/routing/middleware
 *
 * 2. Better Auth middleware
 * https://www.better-auth.com/docs/integrations/next#middleware
 *
 * In Next.js middleware, it's recommended to only check for the existence of a session cookie
 * to handle redirection. To avoid blocking requests by making API or database calls.
 */
export default async function middleware(req: NextRequest) {
  const { nextUrl } = req;

  // Get the pathname of the request (e.g. /zh/dashboard to /dashboard)
  const pathnameWithoutLocale = getPathnameWithoutLocale(
    nextUrl.pathname,
    LOCALES
  );

  // Normalize: strip trailing slash for route matching (trailingSlash:true means
  // the actual pathname is e.g. /assets/ but route definitions use /assets)
  const normalizedPathname =
    pathnameWithoutLocale !== '/' && pathnameWithoutLocale.endsWith('/')
      ? pathnameWithoutLocale.slice(0, -1)
      : pathnameWithoutLocale;

  const requestedLocale = getLocaleFromPathname(nextUrl.pathname, LOCALES);
  const blogPostSlug = getBlogPostSlug(normalizedPathname);
  const blogPostLocales = blogPostSlug
    ? blogLocalesBySlug[blogPostSlug]
    : undefined;
  if (
    blogPostSlug &&
    blogPostLocales &&
    !blogPostLocales.includes((requestedLocale ?? DEFAULT_LOCALE) as Locale)
  ) {
    return new NextResponse(null, { status: 404 });
  }

  if (
    requestedLocale &&
    ENGLISH_ONLY_ROUTES.some((route) => route === normalizedPathname)
  ) {
    const url = new URL(`${normalizedPathname}/`, nextUrl);
    url.search = nextUrl.search;
    return NextResponse.redirect(url, 308);
  }

  // Optimization: only fetch the session for routes that actually gate on it.
  // Public pages skip the API call entirely — every SSR request previously
  // hit /api/auth/get-session, which combined with trailingSlash 308 redirects
  // and many client useSession() callers was exhausting browser/edge sockets.
  const isProtectedRoute = protectedRoutes.some((route) =>
    new RegExp(`^${route}$`).test(normalizedPathname)
  );
  const isNotAllowedRoute = routesNotAllowedByLoggedInUsers.some((route) =>
    new RegExp(`^${route}$`).test(normalizedPathname)
  );
  const needsSessionCheck = isProtectedRoute || isNotAllowedRoute;

  if (needsSessionCheck) {
    // do not use getSession() here, it will cause error related to edge runtime
    const { data: session } = await betterFetch<Session>(
      '/api/auth/get-session/',
      {
        baseURL: getBaseUrl(),
        headers: {
          cookie: req.headers.get('cookie') || '',
        },
      }
    );
    const isLoggedIn = !!session;

    if (isLoggedIn && isNotAllowedRoute) {
      return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
    }

    if (!isLoggedIn && isProtectedRoute) {
      let callbackUrl = nextUrl.pathname;
      if (nextUrl.search) {
        callbackUrl += nextUrl.search;
      }
      const encodedCallbackUrl = encodeURIComponent(callbackUrl);
      return NextResponse.redirect(
        new URL(`/auth/login?callbackUrl=${encodedCallbackUrl}`, nextUrl)
      );
    }
  }

  // Apply intlMiddleware for all routes
  const response = intlMiddleware(req);

  // Issue guest cookie for anonymous homepage visitors. Use cookie presence as
  // a cheap proxy for "logged in" — a false positive just skips issuing the
  // guest cookie, which is harmless.
  // Skipped entirely in classic credits mode: guests can't generate, so the
  // cookie has no purpose and would just be a stale identifier on the wire.
  const shouldIssueGuestCookie =
    websiteConfig.credits.mode !== 'classic' &&
    pathnameWithoutLocale === '/' &&
    req.method === 'GET' &&
    !req.nextUrl.pathname.startsWith('/_next') &&
    !hasAuthSessionCookie(req);

  if (!shouldIssueGuestCookie) {
    return response;
  }

  try {
    const guestCookieName = getGuestCookieName();
    const currentGuestCookie = req.cookies.get(guestCookieName)?.value;
    const verifiedGuestCookie =
      await verifyGuestCookieValue(currentGuestCookie);

    if (!verifiedGuestCookie) {
      response.cookies.set({
        name: guestCookieName,
        value: await createGuestCookieValue(),
        httpOnly: true,
        sameSite: 'lax',
        secure: nextUrl.protocol === 'https:',
        maxAge: getGuestCookieMaxAgeSeconds(),
        path: '/',
      });
    }
  } catch (error) {
    console.error('[middleware] failed to issue guest cookie:', error);
  }

  return response;
}

/**
 * Get the pathname of the request (e.g. /zh/dashboard to /dashboard)
 */
function getPathnameWithoutLocale(pathname: string, locales: string[]): string {
  const exactLocalePattern = new RegExp(`^/(${locales.join('|')})$`);
  if (exactLocalePattern.test(pathname)) {
    return '/';
  }

  const localePrefixPattern = new RegExp(`^/(${locales.join('|')})(/|$)`);
  return pathname.replace(localePrefixPattern, '/');
}

function getLocaleFromPathname(
  pathname: string,
  locales: string[]
): string | null {
  const localePrefixPattern = new RegExp(`^/(${locales.join('|')})(/|$)`);
  return pathname.match(localePrefixPattern)?.[1] ?? null;
}

function getBlogPostSlug(pathname: string): string | null {
  const match = pathname.match(/^\/blog\/([^/]+)\/?$/);
  return match?.[1] ?? null;
}

/**
 * Next.js internationalized routing
 * specify the routes the middleware applies to
 *
 * https://next-intl.dev/docs/routing#base-path
 */
export const config = {
  // The `matcher` is relative to the `basePath`
  matcher: [
    // Match all pathnames except for
    // - if they start with `/api`, `/_next` or `/_vercel`
    // - if they start with `/auth-callback` (OAuth popup callback route handler)
    // - if they contain a dot (e.g. `favicon.ico`)
    '/((?!api|_next|_vercel|auth-callback|.*\\..*).*)',
  ],
};
