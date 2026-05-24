import BlogGridWithPagination from '@/components/blog/blog-grid-with-pagination';
import { websiteConfig } from '@/config/website';
import { LOCALES } from '@/i18n/routing';
import { getLocalizedBlogPosts } from '@/lib/blog-locales';
import { constructMetadata } from '@/lib/metadata';
import { categorySource } from '@/lib/source';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

// Generate all static params for SSG (locale + category + pagination)
export function generateStaticParams() {
  const params: { locale: string; slug: string; page: string }[] = [];
  for (const locale of LOCALES) {
    const localeCategories = categorySource.getPages(locale);
    for (const category of localeCategories) {
      const totalPages = Math.ceil(
        getLocalizedBlogPosts(locale as Locale).filter(
          (post) =>
            post.data.published &&
            post.data.categories.some((cat) => cat === category.slugs[0])
        ).length / websiteConfig.blog.paginationSize
      );
      for (let page = 2; page <= totalPages; page++) {
        params.push({ locale, slug: category.slugs[0], page: String(page) });
      }
    }
  }
  return params;
}

// Generate metadata for each static category page (locale + category + pagination)
export async function generateMetadata({ params }: BlogCategoryPageProps) {
  const { locale, slug, page } = await params;
  const category = categorySource.getPage([slug], locale);
  if (!category) {
    notFound();
  }
  const postsInCategory = getLocalizedBlogPosts(locale)
    .filter((post) => post.data.published)
    .filter((post) => post.data.categories.some((cat) => cat === slug));
  const totalPages = Math.ceil(
    postsInCategory.length / websiteConfig.blog.paginationSize
  );
  const currentPage = Number(page);
  if (
    postsInCategory.length === 0 ||
    currentPage < 2 ||
    currentPage > totalPages
  ) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const canonicalPath = `/blog/category/${slug}/page/${page}`;

  return constructMetadata({
    title: `${category.data.name} | ${t('title')}`,
    description: category.data.description,
    locale,
    pathname: canonicalPath,
  });
}

interface BlogCategoryPageProps {
  params: Promise<{
    locale: Locale;
    slug: string;
    page: string;
  }>;
}

export default async function BlogCategoryPage({
  params,
}: BlogCategoryPageProps) {
  const { locale, slug, page } = await params;
  const localePosts = getLocalizedBlogPosts(locale);
  const publishedPosts = localePosts.filter((post) => post.data.published);
  const filteredPosts = publishedPosts.filter((post) =>
    post.data.categories.some((cat) => cat === slug)
  );
  const sortedPosts = filteredPosts.sort((a, b) => {
    return new Date(b.data.date).getTime() - new Date(a.data.date).getTime();
  });
  const currentPage = Number(page);
  const blogPageSize = websiteConfig.blog.paginationSize;
  const totalPages = Math.ceil(sortedPosts.length / blogPageSize);
  if (sortedPosts.length === 0 || currentPage < 2 || currentPage > totalPages) {
    notFound();
  }

  const paginatedLocalePosts = sortedPosts.slice(
    (currentPage - 1) * blogPageSize,
    currentPage * blogPageSize
  );

  return (
    <BlogGridWithPagination
      locale={locale}
      posts={paginatedLocalePosts}
      totalPages={totalPages}
      routePrefix={`/blog/category/${slug}`}
    />
  );
}
