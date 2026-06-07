import type { Locale } from 'next-intl';

export const blogLocalesBySlug: Record<string, Locale[]> = {
  'gemini-omni-how-to-use': ['en', 'ru'],
  'gemini-omni-image-to-video-guide': ['en'],
  'gemini-omni-pricing-guide': ['en', 'ja', 'it', 'de', 'ru', 'pt'],
};

export function getBlogLocalesForPathname(pathname: string) {
  const match = pathname.match(/^\/blog\/([^/]+)\/?$/);
  if (!match) {
    return undefined;
  }

  return blogLocalesBySlug[match[1]];
}
