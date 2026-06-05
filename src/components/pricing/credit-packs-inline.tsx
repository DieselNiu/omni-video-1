'use client';

import { LoginWrapper } from '@/components/auth/login-wrapper';
import { PaymentCheckoutDialog } from '@/components/pricing/payment-checkout-dialog';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useCreditPackages } from '@/config/credits-config';
import type { CreditPackage } from '@/credits/types';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useMounted } from '@/hooks/use-mounted';
import { useLocalePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { CheckCircleIcon, Coins } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const FEATURE_KEYS = [
  'allModels',
  'noExpiry',
  'highRes',
  'noWatermarks',
  'commercialUse',
  'stackWithSubscription',
] as const;

export function getFeaturedCreditPackages(
  packages: CreditPackage[]
): CreditPackage[] {
  return [...packages]
    .filter((pkg) => !pkg.disabled && pkg.price.priceId)
    .sort((a, b) => a.amount - b.amount)
    .slice(-2);
}

/**
 * Inline credit pack cards rendered in the Pay Once tab.
 * Mirrors the subscription card layout (PricingCard) for visual consistency.
 */
export function CreditPacksInline() {
  const t = useTranslations('PricingPage.creditPacks');
  const tCard = useTranslations('PricingPage.PricingCard');
  const mounted = useMounted();
  const currentUser = useCurrentUser();
  const currentPath = useLocalePathname();

  const allCreditPackages = useCreditPackages();
  const creditPackages = getFeaturedCreditPackages(
    Object.values(allCreditPackages)
  );

  const [checkoutPackageId, setCheckoutPackageId] = useState<string | null>(
    null
  );
  const checkoutPackage = creditPackages.find(
    (p) => p.id === checkoutPackageId
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto w-full">
      {creditPackages.map((pkg) => {
        const hasDiscount =
          pkg.price.originalAmount &&
          pkg.price.originalAmount > pkg.price.amount;
        const discountPercent = hasDiscount
          ? Math.round((1 - pkg.price.amount / pkg.price.originalAmount!) * 100)
          : 0;
        const perCredit = (pkg.price.amount / 100 / pkg.amount).toFixed(3);
        const formattedPrice = (pkg.price.amount / 100).toFixed(2);
        const formattedOriginal = hasDiscount
          ? (pkg.price.originalAmount! / 100).toFixed(2)
          : null;

        return (
          <Card key={pkg.id} className="flex flex-col h-full">
            <CardHeader>
              <CardTitle>
                <h3 className="font-medium flex items-center gap-2">
                  <Coins className="h-5 w-5 shrink-0 text-[#7c3aed]" />
                  <span>
                    {pkg.amount.toLocaleString()} {t('creditsLabel')}
                  </span>
                </h3>
              </CardTitle>

              <CardDescription>
                <p className="text-sm">
                  ${perCredit} {t('perCredit')}
                </p>
              </CardDescription>

              <div className="flex items-center gap-2">
                <span className="block font-semibold my-4 text-4xl">
                  ${formattedPrice}
                </span>
                {formattedOriginal && (
                  <span className="relative text-muted-foreground text-xl">
                    ${formattedOriginal}
                    <span className="absolute left-0 right-0 top-[55%] h-[1.5px] bg-muted-foreground" />
                  </span>
                )}
              </div>

              {discountPercent > 0 && (
                <p className="text-sm font-semibold text-[#7c3aed]">
                  {discountPercent}% OFF
                </p>
              )}

              <div>
                {mounted && currentUser ? (
                  <Button
                    variant="outline"
                    onClick={() => setCheckoutPackageId(pkg.id)}
                    className="mt-4 w-full cursor-pointer"
                  >
                    {tCard('buyNow')}
                  </Button>
                ) : (
                  <LoginWrapper mode="modal" asChild callbackUrl={currentPath}>
                    <Button
                      variant="outline"
                      className="mt-4 w-full cursor-pointer"
                    >
                      {tCard('buyNow')}
                    </Button>
                  </LoginWrapper>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <hr className="border-dashed" />
              <ul className={cn('list-outside space-y-4 text-sm')}>
                <li className="flex items-center gap-1.5">
                  <CheckCircleIcon className="text-green-500 dark:text-green-400 shrink-0 size-4" />
                  <span>
                    {tCard.rich('dynamicVideosUsage', {
                      videos: Math.floor(pkg.amount / 10),
                      highlight: (chunks) => (
                        <span className="font-semibold bg-gradient-to-r from-[#7c3aed] to-[#06b6d4] bg-clip-text text-transparent">
                          {chunks}
                        </span>
                      ),
                    })}
                  </span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircleIcon className="text-green-500 dark:text-green-400 shrink-0 size-4" />
                  <span>
                    {tCard.rich('dynamicImagesUsage', {
                      images: Math.floor(pkg.amount / 2),
                      highlight: (chunks) => (
                        <span className="font-semibold bg-gradient-to-r from-[#7c3aed] to-[#06b6d4] bg-clip-text text-transparent">
                          {chunks}
                        </span>
                      ),
                    })}
                  </span>
                </li>
                {FEATURE_KEYS.map((key) => (
                  <li key={key} className="flex items-center gap-1.5">
                    <CheckCircleIcon className="text-green-500 dark:text-green-400 shrink-0 size-4" />
                    <span>{t(`features.${key}` as 'features.allModels')}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      {mounted && currentUser && checkoutPackage && (
        <PaymentCheckoutDialog
          open={!!checkoutPackageId}
          onOpenChange={(open) => !open && setCheckoutPackageId(null)}
          userId={currentUser.id}
          planId=""
          priceId={checkoutPackage.price.priceId}
          planName={`${checkoutPackage.amount.toLocaleString()} Credits`}
          price={checkoutPackage.price.amount}
          currency="usd"
          credits={checkoutPackage.amount}
          mode="payment"
          packageId={checkoutPackage.id}
          onSuccess={() => setCheckoutPackageId(null)}
        />
      )}
    </div>
  );
}
