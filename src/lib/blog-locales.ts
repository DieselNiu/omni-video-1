import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getLocalePathname } from '@/i18n/navigation';
import { DEFAULT_LOCALE, routing } from '@/i18n/routing';
import type { Locale } from 'next-intl';
import { blogLocalesBySlug } from './blog-locale-map';
import { getHreflangValue } from './hreflang';
import { blogSource } from './source';
import { ensureTrailingSlash, getBaseUrl } from './urls/urls';

type Href = Parameters<typeof getLocalePathname>[0]['href'];

export function getBlogContentFilename(slugs: string[], locale: Locale) {
  const slugPath = slugs.join('/');
  return locale === DEFAULT_LOCALE
    ? `${slugPath}.mdx`
    : `${slugPath}.${locale}.mdx`;
}

export function hasLocalizedBlogContent(slugs: string[], locale: Locale) {
  return existsSync(
    join(process.cwd(), 'content/blog', getBlogContentFilename(slugs, locale))
  );
}

export function getLocalizedBlogPost(slugs: string[], locale: Locale) {
  if (!hasLocalizedBlogContent(slugs, locale)) {
    return undefined;
  }

  const slugPath = slugs.join('/');

  return blogSource
    .getPages(locale)
    .find((post) => post.slugs.join('/') === slugPath);
}

export function getLocalizedBlogPosts(locale: Locale) {
  return blogSource
    .getPages(locale)
    .filter((post) => hasLocalizedBlogContent(post.slugs, locale));
}

export function getBlogPostLocales(slugs: string[]) {
  const slugPath = slugs.join('/');
  const mappedLocales = blogLocalesBySlug[slugPath];
  if (mappedLocales) {
    return mappedLocales;
  }

  return routing.locales.filter((locale) =>
    hasLocalizedBlogContent(slugs, locale)
  ) as Locale[];
}

export function generateBlogPostHreflangUrls(slugs: string[]) {
  const href = `/blog/${slugs.join('/')}` as Href;
  const hreflangUrls: Record<string, string> = {};
  const locales = getBlogPostLocales(slugs);

  locales.forEach((locale) => {
    const pathname = getLocalePathname({ locale, href });
    hreflangUrls[getHreflangValue(locale)] = ensureTrailingSlash(
      getBaseUrl() + pathname
    );
  });

  if (hasLocalizedBlogContent(slugs, routing.defaultLocale)) {
    const defaultPathname = getLocalePathname({
      locale: routing.defaultLocale,
      href,
    });
    hreflangUrls['x-default'] = ensureTrailingSlash(
      getBaseUrl() + defaultPathname
    );
  }

  return hreflangUrls;
}
