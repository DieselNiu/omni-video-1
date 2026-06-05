'use client';

import { LoginWrapper } from '@/components/auth/login-wrapper';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useMounted } from '@/hooks/use-mounted';
import { useLocalePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { PricePlan } from '@/payment/types';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface FreeHorizontalPlanProps {
  plan: PricePlan;
  isCurrentPlan?: boolean;
  compact?: boolean;
  className?: string;
}

export function FreeHorizontalPlan({
  plan,
  isCurrentPlan = false,
  compact = false,
  className,
}: FreeHorizontalPlanProps) {
  const t = useTranslations('PricingPage.PricingCard');
  const mounted = useMounted();
  const currentUser = useCurrentUser();
  const currentPath = useLocalePathname();
  const features = plan.features ?? [];
  const limits = plan.limits ?? [];

  const actionButton = isCurrentPlan ? (
    <Button
      disabled
      variant="secondary"
      className="h-12 w-full rounded-md text-base font-semibold"
    >
      {t('currentPlan')}
    </Button>
  ) : mounted && currentUser ? (
    <Button
      disabled
      variant="secondary"
      className="h-12 w-full rounded-md text-base font-semibold"
    >
      {t('tryNow')}
    </Button>
  ) : (
    <LoginWrapper mode="modal" asChild callbackUrl={currentPath}>
      <Button
        variant="secondary"
        className="h-12 w-full cursor-pointer rounded-md text-base font-semibold"
      >
        {t('tryNow')}
      </Button>
    </LoginWrapper>
  );

  return (
    <Card
      className={cn(
        'w-full border-none bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]',
        compact ? 'p-5' : 'p-6 md:p-8',
        className
      )}
    >
      <div
        className={cn(
          'grid items-center gap-6',
          compact
            ? 'grid-cols-1'
            : 'grid-cols-1 md:grid-cols-[140px_1fr_1fr_220px]'
        )}
      >
        <div>
          <h3 className="text-3xl font-bold tracking-normal text-foreground">
            {plan.name}
          </h3>
          {plan.description && (
            <p className="mt-2 text-sm text-muted-foreground">
              {plan.description}
            </p>
          )}
        </div>

        <ul className="space-y-3">
          {features.map((feature) => (
            <li
              key={feature}
              className="flex items-center gap-3 text-sm font-medium text-foreground"
            >
              <Check className="size-4 shrink-0 text-[#ef4444]" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <ul className="space-y-3">
          {limits.map((limit) => (
            <li
              key={limit}
              className="flex items-center gap-3 text-sm font-medium text-muted-foreground line-through decoration-muted-foreground/70"
            >
              <X className="size-4 shrink-0 text-muted-foreground" />
              <span>{limit}</span>
            </li>
          ))}
        </ul>

        <div className="w-full">{actionButton}</div>
      </div>
    </Card>
  );
}
