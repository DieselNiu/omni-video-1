import { AssetsPageClient } from '@/components/assets/assets-page-client';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { getTranslations } from 'next-intl/server';

export default async function AssetsPage() {
  const t = await getTranslations('Dashboard.assets');

  const breadcrumbs = [{ label: t('title'), isCurrentPage: true }];

  return (
    <>
      <DashboardHeader breadcrumbs={breadcrumbs} />

      <div className="flex flex-1 flex-col p-4 md:p-6">
        <h1 className="mb-6 text-2xl font-bold md:text-3xl">{t('title')}</h1>
        <AssetsPageClient />
      </div>
    </>
  );
}
