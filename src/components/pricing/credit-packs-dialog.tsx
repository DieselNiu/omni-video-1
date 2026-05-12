'use client';

import { LoginWrapper } from '@/components/auth/login-wrapper';
import { PaymentCheckoutDialog } from '@/components/pricing/payment-checkout-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreditPackages } from '@/config/credits-config';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useMounted } from '@/hooks/use-mounted';
import { useLocalePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Coins } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

interface CreditPacksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreditPacksDialog({
  open,
  onOpenChange,
}: CreditPacksDialogProps) {
  const t = useTranslations('PricingPage.creditPacks');
  const mounted = useMounted();
  const currentUser = useCurrentUser();
  const currentPath = useLocalePathname();

  // Get credit packages from config
  const allCreditPackages = useCreditPackages();
  const creditPackages = Object.values(allCreditPackages).filter(
    (pkg) => !pkg.disabled
  );

  // Track selected package
  const [selectedPackageId, setSelectedPackageId] = useState<string>(
    creditPackages.find((pkg) => pkg.popular)?.id || creditPackages[0]?.id || ''
  );

  // Payment dialog state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  // Get selected package
  const selectedPackage = creditPackages.find(
    (pkg) => pkg.id === selectedPackageId
  );

  // Handle buy button click - open payment dialog
  const handleBuyClick = () => {
    if (selectedPackage) {
      setPaymentDialogOpen(true);
    }
  };

  // Handle payment success
  const handlePaymentSuccess = () => {
    setPaymentDialogOpen(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="block w-[calc(100%-2rem)] max-w-[1280px] bg-[#040404] text-white border-slate-800 py-6 px-4 sm:py-8 sm:px-10 md:px-12 box-border max-h-[90vh] overflow-y-auto [&>button]:text-white [&>button]:hover:bg-white/10 [&>button]:top-3 [&>button]:right-3 [&>button]:opacity-90">
        <DialogHeader className="mb-4 sm:mb-6 pr-8">
          <DialogTitle className="text-xl sm:text-2xl font-bold text-white text-center sm:text-left">
            {t('title')}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 w-full">
          {creditPackages.map((pkg) => {
            // Calculate discount if original price exists
            const hasDiscount =
              pkg.price.originalAmount &&
              pkg.price.originalAmount > pkg.price.amount;
            const discountPercent = hasDiscount
              ? Math.round(
                  (1 - pkg.price.amount / pkg.price.originalAmount!) * 100
                )
              : 0;

            return (
              <button
                type="button"
                key={pkg.id}
                onClick={() => setSelectedPackageId(pkg.id)}
                className="relative rounded-xl transition-colors p-[2px]"
                style={{
                  background:
                    selectedPackageId === pkg.id
                      ? 'linear-gradient(135deg, #3b82f6, #06b6d4, #8b5cf6)'
                      : 'transparent',
                }}
              >
                <div
                  className={cn(
                    'flex flex-col items-center justify-center rounded-xl py-5 px-4 min-h-[130px]',
                    selectedPackageId === pkg.id
                      ? 'bg-slate-800'
                      : 'bg-slate-800/60 hover:bg-slate-800/80'
                  )}
                >
                  <div className="flex items-center gap-1.5 text-2xl font-bold text-white">
                    <Coins className="h-6 w-6 shrink-0" />
                    <span>{pkg.amount.toLocaleString()}</span>
                  </div>

                  <div className="flex items-baseline justify-center gap-2 mt-2">
                    <span className="text-lg font-bold text-white">
                      ${(pkg.price.amount / 100).toFixed(2)}
                    </span>
                  </div>

                  <div className="h-5 flex items-center justify-center">
                    {discountPercent > 0 && (
                      <span className="text-xs font-semibold text-orange-400">
                        {discountPercent}% OFF
                      </span>
                    )}
                  </div>

                  <div className="h-4 flex items-center justify-center mt-1">
                    {hasDiscount && (
                      <span className="text-xs text-gray-500 line-through">
                        ${(pkg.price.originalAmount! / 100).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Buy Now Button - requires login */}
        {mounted && currentUser && selectedPackage ? (
          <Button
            size="lg"
            onClick={handleBuyClick}
            className="mt-6 sm:mt-8 w-full bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white text-base sm:text-lg py-5 sm:py-6 rounded-full font-semibold cursor-pointer"
          >
            {t('buyNow')}
          </Button>
        ) : (
          <LoginWrapper mode="modal" asChild callbackUrl={currentPath}>
            <Button
              size="lg"
              className="mt-6 sm:mt-8 w-full bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white text-base sm:text-lg py-5 sm:py-6 rounded-full font-semibold cursor-pointer"
            >
              {t('buyNow')}
            </Button>
          </LoginWrapper>
        )}

        {/* Payment Checkout Dialog */}
        {mounted && currentUser && selectedPackage && (
          <PaymentCheckoutDialog
            open={paymentDialogOpen}
            onOpenChange={setPaymentDialogOpen}
            userId={currentUser.id}
            planId=""
            priceId={selectedPackage.price.priceId}
            planName={`${selectedPackage.amount.toLocaleString()} Credits`}
            price={selectedPackage.price.amount}
            currency="usd"
            credits={selectedPackage.amount}
            mode="payment"
            packageId={selectedPackage.id}
            onSuccess={handlePaymentSuccess}
          />
        )}

        <div className="mt-4 sm:mt-5 space-y-1.5 sm:space-y-2 text-center text-xs sm:text-sm text-gray-400">
          <p className="leading-relaxed">
            {t('termsPrefix')}{' '}
            <Link href="/terms" className="text-red-400 hover:underline">
              {t('termsOfService')}
            </Link>{' '}
            {t('and')}{' '}
            <Link href="/privacy" className="text-red-400 hover:underline">
              {t('privacyPolicy')}
            </Link>
            .
          </p>
          <p className="leading-relaxed">
            {t('tip')}{' '}
            <Link href="/pricing#faqs" className="text-red-400 hover:underline">
              {t('faqs')}
            </Link>{' '}
            {t('tipSuffix')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
