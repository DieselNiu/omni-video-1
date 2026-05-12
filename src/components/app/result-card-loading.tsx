'use client';

import { cn } from '@/lib/utils';

interface ResultCardLoadingProps {
  count?: number;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

function SingleSkeleton() {
  return (
    <div className="rounded-xl border bg-card">
      {/* Header skeleton */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <Skeleton className="size-5 rounded" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-12 ml-auto" />
      </div>

      {/* Prompt skeleton */}
      <div className="px-4 pb-2 space-y-1.5">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>

      {/* Media skeleton */}
      <div className="px-4 pb-3">
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>

      {/* Action buttons skeleton */}
      <div className="flex items-center gap-2 px-3 pb-3">
        <Skeleton className="h-7 w-20 rounded-md" />
        <Skeleton className="h-7 w-20 rounded-md" />
        <Skeleton className="h-7 w-7 rounded-md ml-auto" />
      </div>
    </div>
  );
}

export function ResultCardLoading({ count = 3 }: ResultCardLoadingProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SingleSkeleton key={`skeleton-${i}`} />
      ))}
    </>
  );
}
