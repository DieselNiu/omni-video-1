import { websiteConfig } from '@/config/website';
import { getLocalePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import {
  generateBlogPostHreflangUrls,
  getLocalizedBlogPosts,
} from '@/lib/blog-locales';
import { generateHreflangUrls, getHreflangValue } from '@/lib/hreflang';
import { categorySource } from '@/lib/source';
import type { MetadataRoute } from 'next';
import type { Locale } from 'next-intl';
import { ensureTrailingSlash, getBaseUrl } from '../lib/urls/urls';

type Href = Parameters<typeof getLocalePathname>[0]['href'];

/**
 * static routes for sitemap, you may change the routes for your own
 */
const staticRoutes = ['/', '/pricing', '/privacy', '/terms', '/cookie'];

/**
 * Generate a sitemap for the website with hreflang support
 *
 * https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps
 * https://github.com/javayhu/cnblocks/blob/main/app/sitemap.ts
 * https://ahrefs.com/blog/hreflang-tags/
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sitemapList: MetadataRoute.Sitemap = [];

  sitemapList.push(
    ...staticRoutes.flatMap((route) => {
      return routing.locales.map((locale) => ({
        url: getUrl(route, locale),
        alternates: {
          languages: generateHreflangUrls(route),
        },
      }));
    })
  );

  if (websiteConfig.blog.enable) {
    routing.locales.forEach((locale) => {
      const posts = getLocalizedBlogPosts(locale as Locale).filter(
        (post) => post.data.published
      );
      if (posts.length === 0) {
        return;
      }

      sitemapList.push({
        url: getUrl('/blog', locale),
        alternates: {
          languages: generateBlogIndexHreflangUrls(),
        },
      });

      const totalPages = Math.max(
        1,
        Math.ceil(posts.length / websiteConfig.blog.paginationSize)
      );

      for (let page = 2; page <= totalPages; page++) {
        sitemapList.push({
          url: getUrl(`/blog/page/${page}`, locale),
          alternates: {
            languages: generateHreflangUrls(`/blog/page/${page}`),
          },
        });
      }
    });

    routing.locales.forEach((locale) => {
      const localeCategories = categorySource.getPages(locale);

      localeCategories.forEach((category) => {
        const postsInCategory = getLocalizedBlogPosts(locale as Locale)
          .filter((post) => post.data.published)
          .filter((post) =>
            post.data.categories.some((cat) => cat === category.slugs[0])
          );
        if (postsInCategory.length === 0) {
          return;
        }

        const totalPages = Math.max(
          1,
          Math.ceil(postsInCategory.length / websiteConfig.blog.paginationSize)
        );

        sitemapList.push({
          url: getUrl(`/blog/category/${category.slugs[0]}`, locale),
          alternates: {
            languages: generateHreflangUrls(
              `/blog/category/${category.slugs[0]}`
            ),
          },
        });

        for (let page = 2; page <= totalPages; page++) {
          sitemapList.push({
            url: getUrl(
              `/blog/category/${category.slugs[0]}/page/${page}`,
              locale
            ),
            alternates: {
              languages: generateHreflangUrls(
                `/blog/category/${category.slugs[0]}/page/${page}`
              ),
            },
          });
        }
      });
    });

    routing.locales.forEach((locale) => {
      const posts = getLocalizedBlogPosts(locale as Locale).filter(
        (post) => post.data.published
      );

      posts.forEach((post) => {
        sitemapList.push({
          url: getUrl(`/blog/${post.slugs.join('/')}`, locale),
          lastModified: new Date(post.data.date),
          alternates: {
            languages: generateBlogPostHreflangUrls(post.slugs),
          },
        });
      });
    });
  }

  return sitemapList;
}

function getUrl(href: Href, locale: Locale) {
  const pathname = getLocalePathname({ locale, href });
  return ensureTrailingSlash(getBaseUrl() + pathname);
}

function generateBlogIndexHreflangUrls() {
  const hreflangUrls: Record<string, string> = {};

  routing.locales.forEach((locale) => {
    const publishedPosts = getLocalizedBlogPosts(locale as Locale).filter(
      (post) => post.data.published
    );
    if (publishedPosts.length === 0) {
      return;
    }

    hreflangUrls[getHreflangValue(locale as Locale)] = getUrl('/blog', locale);
  });

  const defaultPosts = getLocalizedBlogPosts(routing.defaultLocale).filter(
    (post) => post.data.published
  );
  if (defaultPosts.length > 0) {
    hreflangUrls['x-default'] = getUrl('/blog', routing.defaultLocale);
  }

  return hreflangUrls;
}
