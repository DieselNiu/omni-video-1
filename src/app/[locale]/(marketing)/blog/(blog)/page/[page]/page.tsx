import BlogGridWithPagination from '@/components/blog/blog-grid-with-pagination';
import { websiteConfig } from '@/config/website';
import { LOCALES } from '@/i18n/routing';
import { getLocalizedBlogPosts } from '@/lib/blog-locales';
import { constructMetadata } from '@/lib/metadata';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  const paginationSize = websiteConfig.blog.paginationSize;
  const params: { locale: string; page: string }[] = [];
  for (const locale of LOCALES) {
    const publishedPosts = getLocalizedBlogPosts(locale as Locale).filter(
      (post) => post.data.published
    );
    const totalPages = Math.max(
      1,
      Math.ceil(publishedPosts.length / paginationSize)
    );
    for (let pageNumber = 2; pageNumber <= totalPages; pageNumber++) {
      params.push({ locale, page: String(pageNumber) });
    }
  }
  return params;
}

export async function generateMetadata({ params }: BlogListPageProps) {
  const { locale, page } = await params;
  const publishedPosts = getLocalizedBlogPosts(locale).filter(
    (post) => post.data.published
  );
  const totalPages = Math.ceil(
    publishedPosts.length / websiteConfig.blog.paginationSize
  );
  const currentPage = Number(page);
  if (
    publishedPosts.length === 0 ||
    currentPage < 2 ||
    currentPage > totalPages
  ) {
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

interface BlogListPageProps {
  params: Promise<{
    locale: Locale;
    page: string;
  }>;
}

export default async function BlogListPage({ params }: BlogListPageProps) {
  const { locale, page } = await params;
  const localePosts = getLocalizedBlogPosts(locale);
  const publishedPosts = localePosts.filter((post) => post.data.published);
  const sortedPosts = publishedPosts.sort((a, b) => {
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
      routePrefix={'/blog'}
    />
  );
}
