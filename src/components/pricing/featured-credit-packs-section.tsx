'use client';

import { LoginWrapper } from '@/components/auth/login-wrapper';
import { PaymentCheckoutDialog } from '@/components/pricing/payment-checkout-dialog';
import { Button } from '@/components/ui/button';
import { useCreditPackages } from '@/config/credits-config';
import type { CreditPackage } from '@/credits/types';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useMounted } from '@/hooks/use-mounted';
import { LocaleLink, useLocalePathname } from '@/i18n/navigation';
import { formatPrice } from '@/lib/formatter';
import { cn } from '@/lib/utils';
import { Routes } from '@/routes';
import { Briefcase, Clock, CreditCard, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

const FEATURED_PACKAGE_IDS = ['standard', 'premium', 'enterprise'] as const;

export function FeaturedCreditPacksSection() {
  const t = useTranslations('UpgradeDialog');
  const tCreditPacks = useTranslations('PricingPage.creditPacks');
  const currentUser = useCurrentUser();
  const mounted = useMounted();
  const currentPath = useLocalePathname();
  const allCreditPackages = useCreditPackages();

  const packages = useMemo(
    () =>
      FEATURED_PACKAGE_IDS.map((id) => allCreditPackages[id]).filter(
        (pkg): pkg is CreditPackage =>
          !!pkg && !pkg.disabled && !!pkg.price.priceId
      ),
    [allCreditPackages]
  );
  const defaultPackageId =
    packages.find((pkg) => pkg.popular)?.id || packages[0]?.id || '';

  const [selectedPackageId, setSelectedPackageId] = useState(defaultPackageId);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    if (!defaultPackageId) return;
    const hasSelectedPackage = packages.some(
      (pkg) => pkg.id === selectedPackageId
    );

    if (!selectedPackageId || !hasSelectedPackage) {
      setSelectedPackageId(defaultPackageId);
    }
  }, [defaultPackageId, packages, selectedPackageId]);

  const selectedPackage = packages.find((pkg) => pkg.id === selectedPackageId);

  if (packages.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-4xl">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_100px_-40px_rgba(15,23,42,0.35)]">
        <div className="px-5 py-6 sm:px-8 sm:py-8 md:px-10">
          <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            {packages.map((pkg) => {
              const hasDiscount =
                !!pkg.price.originalAmount &&
                pkg.price.originalAmount > pkg.price.amount;
              const discountPercent = hasDiscount
                ? Math.round(
                    (1 - pkg.price.amount / pkg.price.originalAmount!) * 100
                  )
                : 0;
              const isSelected = selectedPackageId === pkg.id;

              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setSelectedPackageId(pkg.id)}
                  className="relative rounded-[22px] p-[2px] text-left transition-all"
                  style={{
                    background: isSelected
                      ? 'linear-gradient(135deg, #60a5fa 0%, #6366f1 55%, #8b5cf6 100%)'
                      : 'transparent',
                  }}
                >
                  {hasDiscount ? (
                    <div className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-gradient-to-r from-orange-400 to-rose-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                      -{discountPercent}%
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      'flex h-full min-h-[198px] flex-col items-center rounded-[20px] bg-white px-4 py-5 text-center',
                      isSelected
                        ? 'shadow-[0_12px_30px_-18px_rgba(99,102,241,0.55)]'
                        : 'border border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <div className="text-[42px] font-bold leading-none tracking-tight text-slate-900 sm:text-[46px]">
                      {pkg.amount.toLocaleString()}
                    </div>
                    <div className="mt-2 text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {t('creditsLabel')}
                    </div>
                    <div className="mt-5 h-px w-10 bg-slate-100" />
                    <div className="mt-5 text-[26px] font-bold leading-none text-slate-900">
                      {formatPrice(pkg.price.amount, pkg.price.currency)}
                    </div>
                    <div className="mt-3 min-h-5 text-sm leading-5 text-slate-400 line-through">
                      {hasDiscount
                        ? formatPrice(
                            pkg.price.originalAmount!,
                            pkg.price.currency
                          )
                        : ''}
                    </div>
                    <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {t('perCardBenefits')}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            {mounted && currentUser && selectedPackage ? (
              <Button
                type="button"
                size="lg"
                onClick={() => setCheckoutOpen(true)}
                className="h-14 w-full rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-700 text-base font-semibold text-white shadow-lg shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-800"
              >
                <CreditCard className="size-4" />
                {t('ctaRemoveWatermark')}
              </Button>
            ) : (
              <LoginWrapper mode="modal" asChild callbackUrl={currentPath}>
                <Button
                  type="button"
                  size="lg"
                  className="h-14 w-full rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-700 text-base font-semibold text-white shadow-lg shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-800"
                >
                  <CreditCard className="size-4" />
                  {t('ctaRemoveWatermark')}
                </Button>
              </LoginWrapper>
            )}
          </div>

          <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <Sparkles className="size-2.5" strokeWidth={2.5} />
              </div>
              <p className="text-sm leading-6 text-slate-600">
                {t('benefitWatermark')}
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <Briefcase className="size-2.5" strokeWidth={2.5} />
              </div>
              <p className="text-sm leading-6 text-slate-600">
                {t('benefitCommercial')}
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <Clock className="size-2.5" strokeWidth={2.5} />
              </div>
              <p className="text-sm leading-6 text-slate-600">
                {t('benefitFlexible', {
                  days: selectedPackage?.expireDays ?? 360,
                })}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-1.5 text-center text-xs leading-5 text-slate-500">
            <p>
              {tCreditPacks('termsPrefix')}{' '}
              <LocaleLink
                href={Routes.TermsOfService}
                className="font-medium text-slate-700 underline underline-offset-4"
              >
                {tCreditPacks('termsOfService')}
              </LocaleLink>{' '}
              {tCreditPacks('and')}{' '}
              <LocaleLink
                href={Routes.PrivacyPolicy}
                className="font-medium text-slate-700 underline underline-offset-4"
              >
                {tCreditPacks('privacyPolicy')}
              </LocaleLink>
              .
            </p>
            <p>
              {tCreditPacks('tip')}{' '}
              <LocaleLink
                href="/pricing#faqs"
                className="font-medium text-slate-700 underline underline-offset-4"
              >
                {tCreditPacks('faqs')}
              </LocaleLink>{' '}
              {tCreditPacks('tipSuffix')}
            </p>
          </div>
        </div>
      </div>

      {mounted && currentUser && selectedPackage && (
        <PaymentCheckoutDialog
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          userId={currentUser.id}
          planId=""
          priceId={selectedPackage.price.priceId}
          planName={`${selectedPackage.amount.toLocaleString()} ${t(
            'creditsLabel'
          )}`}
          price={selectedPackage.price.amount}
          currency={selectedPackage.price.currency}
          credits={selectedPackage.amount}
          mode="payment"
          packageId={selectedPackage.id}
        />
      )}
    </section>
  );
}
