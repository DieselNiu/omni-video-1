import BlogGridWithPagination from '@/components/blog/blog-grid-with-pagination';
import { websiteConfig } from '@/config/website';
import { LOCALES } from '@/i18n/routing';
import { getLocalizedBlogPosts } from '@/lib/blog-locales';
import { constructMetadata } from '@/lib/metadata';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  return LOCALES.filter(
    (locale) =>
      getLocalizedBlogPosts(locale as Locale).filter(
        (post) => post.data.published
      ).length > 0
  ).map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: BlogPageProps) {
  const { locale } = await params;
  const publishedPosts = getLocalizedBlogPosts(locale).filter(
    (post) => post.data.published
  );
  if (publishedPosts.length === 0) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({ locale, namespace: 'BlogPage' });

  return constructMetadata({
    title: `${pt('title')} | ${t('title')}`,
    description: pt('description'),
    locale,
    pathname: '/blog',
  });
}

interface BlogPageProps {
  params: Promise<{
    locale: Locale;
  }>;
  searchParams?: Promise<{
    q?: string;
  }>;
}

export default async function BlogPage({
  params,
  searchParams,
}: BlogPageProps) {
  const { locale } = await params;
  const { q = '' } = (await searchParams) ?? {};
  const searchQuery = q.trim();
  const localePosts = getLocalizedBlogPosts(locale);
  const publishedPosts = localePosts.filter((post) => post.data.published);
  if (publishedPosts.length === 0) {
    notFound();
  }

  const sortedPosts = publishedPosts.sort((a, b) => {
    return new Date(b.data.date).getTime() - new Date(a.data.date).getTime();
  });
  const filteredPosts = searchQuery
    ? sortedPosts.filter((post) => {
        const searchText = [
          post.data.title,
          post.data.description,
          post.data.author,
          ...post.data.categories,
        ]
          .join(' ')
          .toLowerCase();

        return searchText.includes(searchQuery.toLowerCase());
      })
    : sortedPosts;
  const currentPage = 1;
  const blogPageSize = websiteConfig.blog.paginationSize;
  const paginatedLocalePosts = filteredPosts.slice(
    (currentPage - 1) * blogPageSize,
    currentPage * blogPageSize
  );
  const totalPages = Math.ceil(filteredPosts.length / blogPageSize);

  return (
    <BlogGridWithPagination
      locale={locale}
      posts={paginatedLocalePosts}
      totalPages={totalPages}
      routePrefix={'/blog'}
      searchQuery={searchQuery}
      totalCount={filteredPosts.length}
    />
  );
}
