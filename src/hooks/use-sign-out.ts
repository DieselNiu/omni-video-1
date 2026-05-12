'use client';

import { useLocaleRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export function useSignOut() {
  const router = useLocaleRouter();
  const queryClient = useQueryClient();
  const t = useTranslations();

  const signOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          queryClient.clear();
          router.replace('/');
        },
        onError: () => {
          toast.error(t('Common.logoutFailed'));
        },
      },
    });
  };

  return signOut;
}
