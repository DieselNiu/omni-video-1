import { Lock, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

export function PaymentMethods() {
  const t = useTranslations('PricingPage.paymentMethods');

  const paymentCards = [
    { name: 'Visa', src: '/pay/visa.webp' },
    { name: 'Mastercard', src: '/pay/mastercard.webp' },
    { name: 'American Express', src: '/pay/ae.webp' },
    { name: 'UnionPay', src: '/pay/union.webp' },
    { name: 'JCB', src: '/pay/jcb.webp' },
  ];

  return (
    <div className="mx-auto mt-16 max-w-4xl">
      <div className="relative grid gap-8 md:grid-cols-2">
        {/* Accepted Payment Methods */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Shield className="h-5 w-5" />
            <h3 className="text-lg font-semibold">{t('acceptedMethods')}</h3>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {paymentCards.map((card) => (
              <div
                key={card.name}
                className="flex h-14 w-20 items-center justify-center rounded-lg p-1"
                title={card.name}
              >
                <Image
                  src={card.src}
                  alt={card.name}
                  width={80}
                  height={56}
                  className="h-auto w-full rounded-lg object-contain"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Vertical Divider - Hidden on mobile */}
        <div className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-gray-200 dark:bg-gray-700 md:block" />

        {/* Secure Payment */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Lock className="h-5 w-5" />
            <h3 className="text-lg font-semibold">{t('securePayment')}</h3>
          </div>
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            {t('secureDescription')}
          </p>
        </div>
      </div>
    </div>
  );
}
