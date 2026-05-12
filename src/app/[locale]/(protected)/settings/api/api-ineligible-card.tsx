'use client';

import { UpgradeDialog } from '@/components/pricing/upgrade-dialog';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { LockIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function ApiIneligibleCard() {
  const t = useTranslations('Dashboard.settings.api.ineligible');
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <LockIcon className="size-5 text-muted-foreground" />
            <CardTitle className="text-lg font-semibold">
              {t('title')}
            </CardTitle>
          </div>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            onClick={() => setUpgradeOpen(true)}
            className="cursor-pointer"
          >
            {t('cta')}
          </Button>
        </CardContent>
      </Card>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </>
  );
}
