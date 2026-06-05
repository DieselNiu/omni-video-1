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

type TextLinkItem = {
  title: string;
  description: string;
  href: string;
};

const RECOMMENDED_TOOLS: TextLinkItem[] = [
  {
    title: 'Gemini Omni Video Generator',
    description:
      'Start from the main Gemini Omni workspace for text-to-video, image-to-video, and reference-led video testing.',
    href: '/#hero',
  },
  {
    title: 'Gemini Omni Image Generator',
    description:
      'Create source images, references, and campaign visuals before moving into video.',
    href: '/image',
  },
  {
    title: 'Gemini Omni Video Tools',
    description:
      'Use the video workspace when you want direct access to Gemini Omni generation controls.',
    href: '/video',
  },
  {
    title: 'Gemini Omni Effects',
    description:
      'Try ready-made effects when you need a fast template-style creative result.',
    href: '/effects',
  },
  {
    title: 'GPT Image 2 API',
    description:
      'Review the API-focused page for builders comparing Gemini Omni image generation options.',
    href: '/gpt-image-2-api',
  },
];

const MORE_AI_TOOLS: TextLinkItem[] = [
  {
    title: 'MovArt AI Video Generator',
    description:
      'Use MovArt when you want a broad creative video workspace with image, video, effects, and editing tools.',
    href: 'https://movart.ai/video/',
  },
  {
    title: 'Wan 2.7 Video Generator',
    description:
      'Use Wan 2.7 for Wan-focused model testing across text, image, reference, and audio-led workflows.',
    href: 'https://wan2-7.io/video/wan2-7/',
  },
  {
    title: 'Wan 2.6 Video Generator',
    description:
      'A stable Wan baseline for text-to-video and image-to-video comparisons.',
    href: 'https://wan2-7.io/video/wan2-6/',
  },
  {
    title: 'Wan 3.0 Video Generator',
    description:
      'Follow the newer Wan 3.0 positioning and video workflow surface.',
    href: 'https://wan30.video/',
  },
];

const PEOPLE_ALSO_READ: TextLinkItem[] = [
  {
    title: 'Wan Series Comparison: Wan 2.2 vs Wan 2.5 vs Wan 2.6 vs Wan 2.7',
    description:
      'Compare Wan model versions by capability, workflow, and practical use case.',
    href: 'https://wan2-7.io/blog/wan-series-comparison/',
  },
  {
    title: 'MovArt Image-to-Video Workflow for Product Scenes',
    description:
      'Plan product image-to-video shots with stronger source images, prompts, and review steps.',
    href: 'https://movart.ai/blog/image-to-video-workflow-for-product-scenes/',
  },
  {
    title: 'MovArt AI Video Prompt Checklist',
    description:
      'Use a practical checklist for subject, camera, motion, lighting, and output review.',
    href: 'https://movart.ai/blog/ai-video-prompt-checklist/',
  },
  {
    title: 'Wan 2.2 Workflow Guide',
    description:
      'Plan prompts, first-frame inputs, and controlled Wan 2.2 generation workflows.',
    href: 'https://wan2-7.io/blog/wan-2-2-workflow-guide/',
  },
];

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

function BlogTextLinkGrid({
  title,
  description,
  items,
  currentHref,
}: {
  title: string;
  description: string;
  items: TextLinkItem[];
  currentHref?: string;
}) {
  const filteredItems = currentHref
    ? items.filter((item) => item.href !== currentHref)
    : items;

  if (filteredItems.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-white/10 pt-12">
      <div className="space-y-3">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {title}
        </h2>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="mt-7 grid gap-3 md:grid-cols-2">
        {filteredItems.map((item) => {
          const cardContent = (
            <div
              key={`${item.href}-content`}
              className="flex items-start justify-between gap-4"
            >
              <div>
                <h3 className="text-base font-semibold leading-snug text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <ArrowRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
          );
          const className =
            'group rounded-lg border border-white/10 bg-white/[0.02] p-4 no-underline transition-colors hover:border-white/25 hover:bg-white/[0.04]';

          return item.href.startsWith('http') ? (
            <a
              key={item.href}
              href={item.href}
              className={className}
              target="_blank"
              rel="noreferrer"
            >
              {cardContent}
            </a>
          ) : (
            <LocaleLink key={item.href} href={item.href} className={className}>
              {cardContent}
            </LocaleLink>
          );
        })}
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
  const postSlug = slug.join('/');

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

      <BlogTextLinkGrid
        title="Recommended Tools"
        description="Continue from this article into the most useful Gemini Omni tools and creative workflows."
        items={RECOMMENDED_TOOLS}
      />

      <BlogTextLinkGrid
        title="More AI Tools"
        description="Explore related AI video and image tools across our broader creator stack."
        items={MORE_AI_TOOLS}
      />

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

      <BlogTextLinkGrid
        title="People Also Read"
        description="More practical guides for AI video models, image-to-video workflows, and prompt planning."
        items={PEOPLE_ALSO_READ}
        currentHref={`https://gemini-omni.video/blog/${postSlug}/`}
      />

      {/* newsletter */}
      <div className="flex items-center justify-start">
        <NewsletterCard />
      </div>
    </div>
  );
}
