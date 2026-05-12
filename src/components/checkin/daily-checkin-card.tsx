'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useDailyCheckinStatus } from '@/hooks/use-daily-checkin';
import { useDailyCheckinDialogStore } from '@/stores/daily-checkin-dialog-store';
import { useTranslations } from 'next-intl';

export function DailyCheckinCard() {
  const t = useTranslations('DailyCheckin');
  const currentUser = useCurrentUser();
  const { openDialog } = useDailyCheckinDialogStore();
  const { data: status } = useDailyCheckinStatus(!!currentUser);

  const totalDays = status?.rewards.length ?? 7;
  const claimedCount = status?.claimedCount ?? 0;
  const hasCheckedInToday = status?.hasCheckedInToday ?? false;
  const isCompleted = status?.isCompleted ?? false;

  let ctaLabel = t('cta.login');
  let ctaDisabled = false;

  if (currentUser) {
    if (isCompleted) {
      ctaLabel = t('cta.completed');
      ctaDisabled = true;
    } else if (hasCheckedInToday) {
      ctaLabel = t('cta.comeBack');
      ctaDisabled = true;
    } else {
      ctaLabel = t('cta.claim');
    }
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('cardTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {currentUser
            ? t('progress', { claimed: claimedCount, total: totalDays })
            : t('cardDescription')}
        </p>
        <Button
          type="button"
          className="w-full"
          onClick={openDialog}
          disabled={ctaDisabled}
        >
          {ctaLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
