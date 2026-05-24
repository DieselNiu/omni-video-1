import type { BlogType } from '@/lib/source';
import { SearchIcon } from 'lucide-react';
import EmptyGrid from '../shared/empty-grid';
import CustomPagination from '../shared/pagination';
import { FeaturedBlogCard } from './blog-card';
import BlogGrid from './blog-grid';

interface BlogGridWithPaginationProps {
  locale: string;
  posts: BlogType[];
  totalPages: number;
  routePrefix: string;
  searchQuery?: string;
  totalCount?: number;
}

export default function BlogGridWithPagination({
  locale,
  posts,
  totalPages,
  routePrefix,
  searchQuery = '',
  totalCount = posts.length,
}: BlogGridWithPaginationProps) {
  const [featuredPost, ...regularPosts] = posts;
  const countLabel =
    posts.length === 0
      ? `Showing 0 of ${totalCount} articles`
      : `Showing 1-${posts.length} of ${totalCount} ${
          totalCount === 1 ? 'article' : 'articles'
        }`;

  return (
    <div className="space-y-10">
      {routePrefix === '/blog' && (
        <div className="space-y-6">
          <form
            action="/blog"
            className="rounded-2xl border border-border/80 bg-card/40 p-4 shadow-sm"
          >
            <label className="flex h-14 items-center gap-3 rounded-xl border border-border bg-background px-4 text-muted-foreground focus-within:border-primary">
              <SearchIcon className="size-5 shrink-0" />
              <input
                type="search"
                name="q"
                defaultValue={searchQuery}
                placeholder="Search articles by title or description"
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground sm:text-base"
              />
            </label>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {countLabel}
          </p>
        </div>
      )}

      {posts.length === 0 && <EmptyGrid />}
      {posts.length > 0 && (
        <>
          {routePrefix === '/blog' && featuredPost ? (
            <FeaturedBlogCard locale={locale} post={featuredPost} />
          ) : null}

          {(
            routePrefix === '/blog'
              ? regularPosts.length > 0
              : posts.length > 0
          ) ? (
            <BlogGrid
              locale={locale}
              posts={routePrefix === '/blog' ? regularPosts : posts}
            />
          ) : null}

          {totalPages > 1 && (
            <div className="flex items-center justify-center">
              <CustomPagination
                routePrefix={routePrefix}
                totalPages={totalPages}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
