import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { isDemoWebsite } from '@/lib/demo';
import { getSession } from '@/lib/server';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface UserCreditsLayoutProps {
  children: React.ReactNode;
  params: Promise<{ userId: string }>;
}

export default async function UserCreditsLayout({
  children,
  params,
}: UserCreditsLayoutProps) {
  const { userId } = await params;
  // if is demo website, allow user to access admin and user pages, but data is fake
  const isDemo = isDemoWebsite();
  // Check if user is admin
  const session = await getSession();
  if (!session || (session.user.role !== 'admin' && !isDemo)) {
    notFound();
  }

  const t = await getTranslations('Dashboard.admin');

  const breadcrumbs = [
    {
      label: t('title'),
      isCurrentPage: false,
    },
    {
      label: t('users.title'),
      href: '/admin/users',
      isCurrentPage: false,
    },
    {
      label: t('userCredits.title'),
      isCurrentPage: true,
    },
  ];

  return (
    <>
      <DashboardHeader breadcrumbs={breadcrumbs} />
      {children}
    </>
  );
}
