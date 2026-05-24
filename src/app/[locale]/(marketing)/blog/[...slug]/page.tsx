import BlogImage from '@/components/blog/blog-image';
import { BlogPostActions } from '@/components/blog/blog-post-actions';
import { getMDXComponents } from '@/components/docs/mdx-components';
import { NewsletterCard } from '@/components/newsletter/newsletter-card';
import { PremiumBadge } from '@/components/premium/premium-badge';
import { PremiumGuard } from '@/components/premium/premium-guard';
import { websiteConfig } from '@/config/website';
import { LocaleLink } from '@/i18n/navigation';
import {
  generateBlogPostHreflangUrls,
  getBlogPostLocales,
  getLocalizedBlogPost,
  getLocalizedBlogPosts,
} from '@/lib/blog-locales';
import { formatDate } from '@/lib/formatter';
import { constructMetadata } from '@/lib/metadata';
import { checkPremiumAccess } from '@/lib/premium-access';
import { getSession } from '@/lib/server';
import {
  type BlogType,
  authorSource,
  blogSource,
  categorySource,
} from '@/lib/source';
import { ArrowRightIcon, CalendarIcon, ChevronRightIcon } from 'lucide-react';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import '@/styles/mdx.css';

type TocItem = {
  title: ReactNode;
  url: string;
  depth: number;
};

/**
 * get related posts, random pick from all posts with same locale, different slug,
 * max size is websiteConfig.blog.relatedPostsSize
 */
async function getRelatedPosts(post: BlogType, locale: Locale) {
  const relatedPosts = getLocalizedBlogPosts(locale)
    .filter((p) => p.data.published)
    .filter((p) => p.slugs.join('/') !== post.slugs.join('/'))
    .sort(() => Math.random() - 0.5)
    .slice(0, websiteConfig.blog.relatedPostsSize);

  return relatedPosts;
}

function BlogTableOfContents({ items }: { items?: TocItem[] }) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-32 rounded-lg border border-white/8 bg-white/[0.015] p-4">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Table of Contents
        </h2>
        <nav className="mt-4 space-y-1">
          {items.map((item) => (
            <a
              key={item.url}
              href={item.url}
              className="block rounded-md px-2 py-1.5 text-sm leading-5 text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
              style={{
                marginLeft: Math.max(0, item.depth - 2) * 10,
              }}
            >
              {item.title}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}

function BlogBottomCta() {
  return (
    <section className="max-w-[749px] rounded-xl border border-[#dededb] bg-[#fbfbfa] p-6 text-[#202020] shadow-[0_10px_35px_rgba(15,15,15,0.07)] ring-1 ring-white md:p-8 dark:border-white/10 dark:bg-white/[0.035] dark:text-foreground dark:shadow-black/20 dark:ring-white/5">
      <div className="max-w-2xl">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Ready to create your own AI video?
        </h2>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Turn ideas, text prompts, reference images, and video clips into
          polished visual assets with Gemini Omni. If this article helped, the
          fastest next step is to try the product.
        </p>
        <p className="mt-5 text-lg font-medium">
          Free credits on signup. Upgrade when your workflow needs more
          capacity.
        </p>
      </div>

      <div className="mt-7 flex flex-wrap gap-3">
        <LocaleLink
          href="/#hero"
          className="inline-flex h-11 items-center rounded-md border border-[#d6d6d2] bg-[#f1f1ef] px-5 text-sm font-medium text-[#202020] no-underline shadow-[0_1px_2px_rgba(15,15,15,0.08)] transition-colors hover:bg-[#e9e9e6] hover:text-[#202020] dark:border-white/15 dark:bg-white/10 dark:text-foreground dark:hover:bg-white/15"
        >
          Try image to video
          <ArrowRightIcon className="ml-2 size-4" />
        </LocaleLink>
        <LocaleLink
          href="/#hero"
          className="inline-flex h-11 items-center rounded-md border border-[#d6d6d2] bg-white px-5 text-sm font-medium text-[#202020] no-underline shadow-[0_1px_2px_rgba(15,15,15,0.05)] transition-colors hover:bg-[#f7f7f5] hover:text-[#202020] dark:border-white/15 dark:bg-transparent dark:text-foreground dark:hover:bg-white/10"
        >
          Try text to video
        </LocaleLink>
        <LocaleLink
          href="/#hero"
          className="inline-flex h-11 items-center rounded-md border border-[#d6d6d2] bg-white px-5 text-sm font-medium text-[#202020] no-underline shadow-[0_1px_2px_rgba(15,15,15,0.05)] transition-colors hover:bg-[#f7f7f5] hover:text-[#202020] dark:border-white/15 dark:bg-transparent dark:text-foreground dark:hover:bg-white/10"
        >
          Explore Gemini Omni
        </LocaleLink>
      </div>
    </section>
  );
}

function RelatedBlogCard({ post, locale }: { post: BlogType; locale: Locale }) {
  const { title, description, image, categories } = post.data;
  const blogCategories = categorySource
    .getPages(locale)
    .filter((category) => categories.includes(category.slugs[0] ?? ''));

  return (
    <LocaleLink href={`/blog/${post.slugs.join('/')}`} className="block h-full">
      <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] transition-colors hover:border-white/25 hover:bg-white/[0.035]">
        <div className="relative h-32 overflow-hidden md:h-36">
          <BlogImage
            src={image}
            alt={title || 'image for related blog post'}
            title={title || 'image for related blog post'}
          />
        </div>
        <div className="flex flex-1 flex-col p-3">
          {blogCategories[0] && (
            <span className="text-xs font-medium text-muted-foreground">
              {blogCategories[0].data.name}
            </span>
          )}
          <h3 className="mt-2 line-clamp-2 text-base font-semibold leading-snug">
            {title}
          </h3>
          {description && (
            <p className="mt-2 line-clamp-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          )}
          <span className="mt-3 inline-flex items-center text-sm font-medium text-foreground">
            Read article
            <ArrowRightIcon className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </article>
    </LocaleLink>
  );
}

export function generateStaticParams() {
  const seenSlugs = new Set<string>();

  return blogSource
    .getPages()
    .filter((post) => post.data.published)
    .flatMap((post) => {
      const slugPath = post.slugs.join('/');
      if (seenSlugs.has(slugPath)) {
        return [];
      }
      seenSlugs.add(slugPath);

      return getBlogPostLocales(post.slugs).map((locale) => ({
        locale,
        slug: post.slugs,
      }));
    });
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata | undefined> {
  const { locale, slug } = await params;
  const post = getLocalizedBlogPost(slug, locale);
  if (!post || !post.data.published) {
    notFound();
  }

  return constructMetadata({
    title: post.data.title,
    description: post.data.description,
    locale,
    pathname: `/blog/${slug.join('/')}`,
    image: post.data.image,
    alternateLanguages: generateBlogPostHreflangUrls(slug),
  });
}

interface BlogPostPageProps {
  params: Promise<{
    locale: Locale;
    slug: string[];
  }>;
}

export default async function BlogPostPage(props: BlogPostPageProps) {
  const { locale, slug } = await props.params;
  const post = getLocalizedBlogPost(slug, locale);
  if (!post || !post.data.published) {
    notFound();
  }

  const { date, title, description, image, author, categories, premium } =
    post.data;
  const publishDate = formatDate(new Date(date));

  const blogAuthor = authorSource.getPage([author], locale);
  const blogCategories = categorySource
    .getPages(locale)
    .filter((category) => categories.includes(category.slugs[0] ?? ''));

  // Check premium access for premium posts
  const session = await getSession();
  const hasPremiumAccess =
    premium && session?.user?.id
      ? await checkPremiumAccess(session.user.id)
      : !premium; // Non-premium posts are always accessible

  const MDX = post.data.body;

  // get related posts
  const relatedPosts = await getRelatedPosts(post, locale);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <LocaleLink href="/" className="hover:text-foreground">
          home
        </LocaleLink>
        <ChevronRightIcon className="size-4" />
        <LocaleLink href="/blog" className="hover:text-foreground">
          blog
        </LocaleLink>
        <ChevronRightIcon className="size-4" />
        <span className="line-clamp-1 text-foreground">{title}</span>
      </nav>

      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {premium && <PremiumBadge size="sm" />}
          </div>

          <h1 className="max-w-3xl text-3xl font-bold tracking-tight md:text-5xl">
            {title}
          </h1>
          <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
            {description}
          </p>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-primary/10 text-sm font-semibold text-primary">
                {blogAuthor?.data.avatar ? (
                  <Image
                    src={blogAuthor.data.avatar}
                    alt={`avatar for ${blogAuthor.data.name}`}
                    className="object-cover"
                    fill
                  />
                ) : (
                  (blogAuthor?.data.name?.charAt(0) ?? 'M')
                )}
              </div>
              <span className="font-medium text-foreground">
                {blogAuthor?.data.name ?? author}
              </span>
            </div>
            <span className="hidden sm:inline">.</span>
            <span>3 min read</span>
            <span className="hidden sm:inline">.</span>
            <span className="flex items-center gap-2">
              <CalendarIcon className="size-4" />
              {publishDate}
            </span>
          </div>

          <BlogPostActions title={title} />
        </div>

        <div className="group relative aspect-video overflow-hidden rounded-2xl border border-border/80 bg-card">
          {image &&
            (image.endsWith('.svg') ? (
              <img
                src={image}
                alt={title || 'image for blog post'}
                title={title || 'image for blog post'}
                className="h-full w-full object-cover"
              />
            ) : (
              <Image
                src={image}
                alt={title || 'image for blog post'}
                title={title || 'image for blog post'}
                loading="eager"
                fill
                className="object-cover"
              />
            ))}
        </div>
      </div>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,749px)_300px]">
        <PremiumGuard
          isPremium={!!premium}
          canAccess={hasPremiumAccess}
          className="max-w-none"
        >
          <MDX components={getMDXComponents()} />
        </PremiumGuard>

        <BlogTableOfContents items={post.data.toc as TocItem[] | undefined} />
      </div>

      <BlogBottomCta />

      <section className="border-t border-white/10 pt-12">
        <div className="space-y-4">
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            Related Articles
          </h2>
          <p className="text-lg text-muted-foreground">
            More posts in the same locale you may want to read next.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <LocaleLink
              href="/blog"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-white/40"
            >
              Browse more blog posts
            </LocaleLink>
            <LocaleLink
              href="/#hero"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-white/40"
            >
              Image to video
            </LocaleLink>
            <LocaleLink
              href="/#hero"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-white/40"
            >
              Text to video
            </LocaleLink>
          </div>
        </div>

        {relatedPosts && relatedPosts.length > 0 && (
          <div className="mt-10 grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-3">
            {relatedPosts.slice(0, 3).map((relatedPost) => (
              <RelatedBlogCard
                key={relatedPost.slugs.join('/')}
                post={relatedPost}
                locale={locale}
              />
            ))}
          </div>
        )}
      </section>

      {/* newsletter */}
      <div className="flex items-center justify-start">
        <NewsletterCard />
      </div>
    </div>
  );
}
