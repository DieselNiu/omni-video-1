import { AppPageClient } from '@/components/app/app-page-client';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { getTranslations } from 'next-intl/server';

interface AppPageProps {
  searchParams?: Promise<{
    target?: string;
    taskId?: string;
  }>;
}

export default async function AppPage({ searchParams }: AppPageProps) {
  const t = await getTranslations('Dashboard.app');
  const params = (await searchParams) ?? {};
  const target = params.target === 'video' ? 'video' : 'image';
  const taskId = params.taskId || undefined;

  const breadcrumbs = [
    {
      label: t('title'),
      isCurrentPage: true,
    },
  ];

  return (
    <>
      <DashboardHeader breadcrumbs={breadcrumbs} />
      <AppPageClient target={target} taskId={taskId} />
    </>
  );
}
