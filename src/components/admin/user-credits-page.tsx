'use client';

import { useUserCreditTransactions } from '@/hooks/use-user-credit-transactions';
import type { SortingState } from '@tanstack/react-table';
import { ArrowLeftIcon, MailIcon, UserIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { UserCreditsTable } from './user-credits-table';

interface UserCreditsPageClientProps {
  userId: string;
}

export function UserCreditsPageClient({ userId }: UserCreditsPageClientProps) {
  const t = useTranslations('Dashboard.admin.userCredits');

  // Pagination state
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [type, setType] = useState('all');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);

  // Fetch data
  const { data, isLoading, error } = useUserCreditTransactions(
    userId,
    pageIndex,
    pageSize,
    type === 'all' ? '' : type,
    sorting
  );

  const handleTypeChange = (newType: string) => {
    setType(newType);
    setPageIndex(0);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-destructive">{t('error')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header with user info and back button */}
      <div className="flex items-center gap-4 px-4 lg:px-6">
        <Link href="/admin/users">
          <Button variant="outline" size="sm" className="cursor-pointer gap-2">
            <ArrowLeftIcon className="h-4 w-4" />
            {t('backToUsers')}
          </Button>
        </Link>
        <div className="flex items-center gap-4">
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-48" />
            </>
          ) : data?.user ? (
            <>
              <Badge variant="outline" className="gap-1.5 px-2 py-1">
                <UserIcon className="h-3.5 w-3.5" />
                {data.user.name}
              </Badge>
              <Badge variant="secondary" className="gap-1.5 px-2 py-1">
                <MailIcon className="h-3.5 w-3.5" />
                {data.user.email}
              </Badge>
            </>
          ) : null}
        </div>
      </div>

      {/* Table */}
      <UserCreditsTable
        data={data?.items || []}
        total={data?.total || 0}
        pageIndex={pageIndex}
        pageSize={pageSize}
        type={type}
        sorting={sorting}
        loading={isLoading}
        onTypeChange={handleTypeChange}
        onPageChange={setPageIndex}
        onPageSizeChange={setPageSize}
        onSortingChange={setSorting}
      />
    </div>
  );
}
