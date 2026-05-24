import { Skeleton } from '@/components/ui/skeleton';
import { LocaleLink } from '@/i18n/navigation';
import { formatDate } from '@/lib/formatter';
import { type BlogType, authorSource, categorySource } from '@/lib/source';
import Image from 'next/image';
import { PremiumBadge } from '../premium/premium-badge';
import BlogImage from './blog-image';

interface BlogCardProps {
  locale: string;
  post: BlogType;
}

export default function BlogCard({ locale, post }: BlogCardProps) {
  const { date, title, description, image, author, categories } = post.data;
  const publishDate = formatDate(new Date(date));
  const blogAuthor = authorSource.getPage([author], locale);
  const blogCategories = categorySource
    .getPages(locale)
    .filter((category) => categories.includes(category.slugs[0] ?? ''));

  const href = `/blog/${post.slugs.join('/')}`;

  return (
    <LocaleLink
      href={href}
      className="block h-full"
      data-blog-card="true"
      data-blog-search={`${title} ${description ?? ''} ${blogAuthor?.data.name ?? ''} ${blogCategories.map((category) => category.data.name).join(' ')}`.toLowerCase()}
    >
      <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/40 transition-all duration-300 ease-in-out hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10">
        <div className="group relative aspect-video w-full overflow-hidden">
          <div className="relative w-full h-full">
            <BlogImage
              src={image}
              alt={title || 'image for blog post'}
              title={title || 'image for blog post'}
            />

            {post.data.premium && (
              <div className="absolute top-2 right-2 z-20">
                <PremiumBadge size="sm" />
              </div>
            )}

            {blogCategories && blogCategories.length > 0 && (
              <div className="absolute left-2 bottom-2 opacity-100 transition-opacity duration-300 z-20">
                <div className="flex flex-wrap gap-1">
                  {blogCategories.map((category, index) => (
                    <span
                      key={`${category?.slugs[0]}-${index}`}
                      className="text-xs font-medium text-white bg-black/50 bg-opacity-50 px-2 py-1 rounded-md"
                    >
                      {category?.data.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 flex-1">
          <div>
            <time className="text-xs text-muted-foreground" dateTime={date}>
              {publishDate}
            </time>
            <h3 className="mt-3 text-xl line-clamp-2 font-semibold leading-tight">
              {title}
            </h3>

            <div className="mt-2">
              {description && (
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t flex items-center justify-between gap-4 text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="relative h-8 w-8 shrink-0">
                {blogAuthor?.data.avatar && (
                  <Image
                    src={blogAuthor?.data.avatar}
                    alt={`avatar for ${blogAuthor?.data.name}`}
                    className="rounded-full object-cover border"
                    fill
                  />
                )}
              </div>
              <span className="truncate text-sm">{blogAuthor?.data.name}</span>
            </div>

            <span className="shrink-0 text-sm font-medium text-primary">
              Read More
            </span>
          </div>
        </div>
      </article>
    </LocaleLink>
  );
}

export function FeaturedBlogCard({ locale, post }: BlogCardProps) {
  const { title, description, image, author, categories } = post.data;
  const href = `/blog/${post.slugs.join('/')}`;
  const blogAuthor = authorSource.getPage([author], locale);
  const blogCategories = categorySource
    .getPages(locale)
    .filter((category) => categories.includes(category.slugs[0] ?? ''));

  return (
    <LocaleLink
      href={href}
      className="block"
      data-blog-card="true"
      data-featured-blog-card="true"
      data-blog-search={`${title} ${description ?? ''} ${blogAuthor?.data.name ?? ''} ${blogCategories.map((category) => category.data.name).join(' ')}`.toLowerCase()}
    >
      <article className="group overflow-hidden rounded-2xl border border-border/80 bg-card/40 transition-all duration-300 hover:border-primary/60 hover:shadow-xl hover:shadow-primary/10">
        <div className="grid gap-0 md:grid-cols-[1.15fr_0.85fr]">
          <div className="relative aspect-video overflow-hidden md:aspect-auto md:min-h-[360px]">
            <BlogImage
              src={image}
              alt={title || 'image for featured blog post'}
              title={title || 'image for featured blog post'}
            />
          </div>
          <div className="flex flex-col justify-center p-6 md:p-8">
            <div className="mb-5 text-xs font-semibold uppercase tracking-[0.35em] text-primary">
              Featured article
            </div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {title}
            </h2>
            {description && (
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {description}
              </p>
            )}
            <span className="mt-6 text-sm font-semibold text-primary">
              Read More
            </span>
          </div>
        </div>
      </article>
    </LocaleLink>
  );
}

export function BlogCardSkeleton() {
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden h-full">
      <div className="overflow-hidden relative aspect-16/9 w-full">
        <Skeleton className="h-full w-full rounded-b-none" />
      </div>
      <div className="p-4 flex flex-col justify-between flex-1">
        <div>
          <Skeleton className="h-6 w-full mb-2" />
          <Skeleton className="h-4 w-full mb-4" />
        </div>
        <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    </div>
  );
}
