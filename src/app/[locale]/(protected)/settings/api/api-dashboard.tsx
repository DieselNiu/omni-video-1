'use client';

import { checkApiEligibilityAction } from '@/actions/check-api-eligibility';
import { Spinner } from '@/components/ui/spinner';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ApiCurlExamples } from './api-curl-examples';
import { ApiIneligibleCard } from './api-ineligible-card';
import { ApiKeysSection } from './api-keys-section';
import { ApiUsageLogs } from './api-usage-logs';

interface EligibilityResult {
  eligible: boolean;
}

function unwrap<T>(result: unknown): T {
  const r = result as
    | {
        data?: T & { success?: boolean; error?: string };
        serverError?: string;
      }
    | undefined;
  if (r?.serverError) {
    throw new Error(r.serverError);
  }
  const data = r?.data;
  if (data && typeof data === 'object' && 'success' in data) {
    const wrapped = data as { success?: boolean; error?: string } & T;
    if (wrapped.success === false) {
      throw new Error(wrapped.error || 'Request failed');
    }
  }
  if (data === undefined || data === null) {
    throw new Error('Empty response');
  }
  return data as T;
}

export default function ApiDashboard() {
  const t = useTranslations('Dashboard.settings.api');

  const eligibilityQuery = useQuery({
    queryKey: ['api-eligibility'],
    queryFn: async () => {
      const result = await checkApiEligibilityAction();
      return unwrap<EligibilityResult>(result);
    },
  });

  if (eligibilityQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (eligibilityQuery.isError) {
    return (
      <div className="py-6 text-sm text-destructive">
        {(eligibilityQuery.error as Error)?.message || t('eligibilityError')}
      </div>
    );
  }

  const eligible = eligibilityQuery.data?.eligible ?? false;

  if (!eligible) {
    return (
      <div className="flex flex-col gap-8">
        <ApiIneligibleCard />
        <ApiCurlExamples />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <ApiKeysSection />
      <ApiUsageLogs />
      <ApiCurlExamples />
    </div>
  );
}
