'use client';

import { createCheckoutAction } from '@/actions/create-checkout-session';
import { createCreditCheckoutSession } from '@/actions/create-credit-checkout-session';
import {
  PayPalButtons,
  PayPalScriptProvider,
  usePayPalScriptReducer,
} from '@paypal/react-paypal-js';
import {
  BitcoinIcon,
  CreditCardIcon,
  Loader2Icon,
  ShieldCheckIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { websiteConfig } from '@/config/website';
import type { PlanInterval } from '@/payment/types';

// Toggle this to true when Stripe card payments are approved
const ENABLE_STRIPE_CARD = true;

// Payment method types
type PaymentMethod = 'card' | 'paypal' | 'nowpayments';

interface PaymentCheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // User info
  userId: string;
  // Order info
  planId: string;
  priceId: string;
  planName: string;
  price: number; // in cents
  currency: string;
  interval?: PlanInterval;
  credits?: number;
  features?: string[];
  // Payment type
  mode: 'subscription' | 'payment';
  // For credit purchases
  packageId?: string;
  // Callbacks
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

type PayPalButtonsGroupProps = {
  mode: 'subscription' | 'payment';
  createPayPalOrder: () => Promise<string>;
  createPayPalSubscription: () => Promise<string>;
  onApprove: (data: {
    orderID?: string;
    subscriptionID?: string | null;
  }) => Promise<void>;
  onError: (error: unknown, source: 'paypal' | 'card') => void;
  onCancel: () => void;
  loadingText?: string;
  errorText?: string;
};

function PayPalButtonsGroup({
  mode,
  createPayPalOrder,
  createPayPalSubscription,
  onApprove,
  onError,
  onCancel,
  loadingText = 'Loading PayPal...',
  errorText = 'PayPal is temporarily unavailable.',
}: PayPalButtonsGroupProps) {
  const [{ isResolved, isRejected, options }] = usePayPalScriptReducer();
  const dataNamespace =
    typeof options?.dataNamespace === 'string' && options.dataNamespace
      ? options.dataNamespace
      : 'paypal';

  if (isRejected) {
    return (
      <p className="text-center text-muted-foreground py-4">{errorText}</p>
    );
  }

  if (!isResolved) {
    return (
      <p className="text-center text-muted-foreground py-4">{loadingText}</p>
    );
  }

  const hasButtons =
    typeof window !== 'undefined' &&
    typeof (window as any)[dataNamespace]?.Buttons === 'function';

  if (!hasButtons) {
    return (
      <p className="text-center text-muted-foreground py-4">{errorText}</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg overflow-hidden">
        <PayPalButtons
          style={{
            layout: 'vertical',
            shape: 'rect',
            label: 'paypal',
          }}
          fundingSource="paypal"
          createOrder={mode === 'payment' ? createPayPalOrder : undefined}
          createSubscription={
            mode === 'subscription' ? createPayPalSubscription : undefined
          }
          onApprove={onApprove}
          onError={(err) => onError(err, 'paypal')}
          onCancel={onCancel}
        />
      </div>
      <div className="rounded-lg overflow-hidden">
        <PayPalButtons
          style={{
            layout: 'vertical',
            shape: 'rect',
            label: 'pay',
            color: 'black',
          }}
          fundingSource="card"
          createOrder={mode === 'payment' ? createPayPalOrder : undefined}
          createSubscription={
            mode === 'subscription' ? createPayPalSubscription : undefined
          }
          onApprove={onApprove}
          onError={(err) => onError(err, 'card')}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}

/**
 * Payment Checkout Dialog
 *
 * A dialog with payment method selection:
 * - Credit or debit card: Redirects to Stripe hosted checkout page
 * - PayPal: Shows PayPal payment buttons
 */
export function PaymentCheckoutDialog({
  open,
  onOpenChange,
  userId,
  planId,
  priceId,
  planName,
  price,
  currency,
  interval,
  credits,
  features,
  mode,
  packageId,
  onSuccess,
  onError,
}: PaymentCheckoutDialogProps) {
  const t = useTranslations('PricingPage.paymentDialog');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    ENABLE_STRIPE_CARD ? 'card' : 'paypal'
  );
  const [isLoading, setIsLoading] = useState(false);

  // Format price for display
  const formattedPrice = (price / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  });

  // Price label based on interval
  const priceLabel =
    mode === 'subscription' && interval
      ? interval === 'year'
        ? `/${t('year')}`
        : `/${t('month')}`
      : '';

  // PayPal Client ID
  const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '';
  const paypalNamespace = `paypal_${mode}_${currency}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setIsLoading(false);
    }
  }, [open]);

  // Handle payment method change
  const handleMethodChange = useCallback((value: string) => {
    setSelectedMethod(value as PaymentMethod);
  }, []);

  // Handle hosted checkout button click - redirects to Stripe or NOWPayments
  const handlePayNow = useCallback(async () => {
    if (selectedMethod !== 'card' && selectedMethod !== 'nowpayments') return;

    setIsLoading(true);
    try {
      const metadata: Record<string, string> = {};

      // add promotekit_referral to metadata if enabled promotekit affiliate
      if (websiteConfig.features.enablePromotekitAffiliate) {
        const promotekitReferral =
          typeof window !== 'undefined'
            ? (window as any).promotekit_referral
            : undefined;
        if (promotekitReferral) {
          metadata.promotekit_referral = promotekitReferral;
        }
      }

      // add affonso_referral to metadata if enabled affonso affiliate
      if (websiteConfig.features.enableAffonsoAffiliate) {
        const affonsoReferral =
          typeof document !== 'undefined'
            ? (() => {
                const match = document.cookie.match(
                  /(?:^|; )affonso_referral=([^;]*)/
                );
                return match ? decodeURIComponent(match[1]) : null;
              })()
            : null;
        if (affonsoReferral) {
          metadata.affonso_referral = affonsoReferral;
        }
      }

      // Determine which action to call based on mode and packageId
      // For credit purchases (mode === 'payment' && packageId), use createCreditCheckoutSession
      // For subscriptions or other payments, use createCheckoutAction
      const isCreditPurchase = mode === 'payment' && packageId;
      const provider =
        selectedMethod === 'nowpayments' ? 'nowpayments' : 'stripe';

      const result = isCreditPurchase
        ? await createCreditCheckoutSession({
            userId,
            packageId,
            priceId,
            provider,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          })
        : await createCheckoutAction({
            userId,
            planId,
            priceId,
            provider,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          });

      // Redirect to checkout page
      if (result?.data?.success && result.data.data?.url) {
        window.location.href = result.data.data.url;
      } else {
        console.error('Create checkout session error, result:', result);
        toast.error(t('paymentFailed'));
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Hosted checkout error:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to create checkout session'
      );
      setIsLoading(false);
    }
  }, [selectedMethod, userId, planId, priceId, mode, packageId, t]);

  /**
   * Create PayPal Order
   */
  const createPayPalOrder = useCallback(async () => {
    try {
      const res = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          priceId,
          packageId,
          type: packageId ? 'credit_purchase' : undefined,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create order');
      }

      const { orderId } = await res.json();
      return orderId;
    } catch (error) {
      console.error('PayPal create order error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create order'
      );
      throw error;
    }
  }, [planId, priceId, packageId]);

  /**
   * Create PayPal Subscription
   */
  const createPayPalSubscription = useCallback(async () => {
    try {
      const res = await fetch('/api/paypal/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, priceId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create subscription');
      }

      const { subscriptionId } = await res.json();
      return subscriptionId;
    } catch (error) {
      console.error('PayPal create subscription error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create subscription'
      );
      throw error;
    }
  }, [planId, priceId]);

  /**
   * Capture PayPal Order
   */
  const capturePayPalOrder = useCallback(async (orderId: string) => {
    try {
      const res = await fetch('/api/paypal/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to capture order');
      }

      return await res.json();
    } catch (error) {
      console.error('PayPal capture order error:', error);
      throw error;
    }
  }, []);

  /**
   * Confirm PayPal Subscription
   */
  const confirmPayPalSubscription = useCallback(
    async (subscriptionId: string) => {
      try {
        const res = await fetch('/api/paypal/confirm-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscriptionId, planId, priceId }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Failed to confirm subscription');
        }

        return await res.json();
      } catch (error) {
        console.error('PayPal confirm subscription error:', error);
        throw error;
      }
    },
    [planId, priceId]
  );

  /**
   * Handle PayPal payment success
   */
  const handlePayPalSuccess = useCallback(() => {
    toast.success(t('paymentSuccess'));
    onOpenChange(false);
    onSuccess?.();
    // Redirect to payment page - reuse existing page
    const callbackUrl = packageId ? '/settings/credits' : '/settings/billing';
    window.location.href = `/payment?callback=${callbackUrl}`;
  }, [t, onOpenChange, onSuccess, packageId]);

  /**
   * Handle PayPal Approve
   */
  const handlePayPalApprove = useCallback(
    async (data: { orderID?: string; subscriptionID?: string | null }) => {
      try {
        if (mode === 'subscription' && data.subscriptionID) {
          try {
            await confirmPayPalSubscription(data.subscriptionID);
          } catch (confirmError) {
            console.warn(
              'Subscription confirm failed, continuing:',
              confirmError
            );
          }
        } else if (data.orderID) {
          await capturePayPalOrder(data.orderID);
        }
        handlePayPalSuccess();
      } catch (error) {
        console.error('PayPal onApprove error:', error);
        toast.error(t('paymentFailed'));
        onError?.(error instanceof Error ? error : new Error('Payment failed'));
      }
    },
    [
      mode,
      confirmPayPalSubscription,
      capturePayPalOrder,
      handlePayPalSuccess,
      t,
      onError,
    ]
  );

  const handlePayPalError = useCallback(
    (error: unknown, source: 'paypal' | 'card') => {
      const label = source === 'card' ? 'PayPal card error:' : 'PayPal error:';
      console.error(label, error);
      toast.error(t('paymentFailed'));
    },
    [t]
  );

  const handlePayPalCancel = useCallback(() => {
    toast.info(t('paymentCancelled'));
  }, [t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-lg font-semibold">
            {mode === 'subscription' ? t('subscribeTitle') : t('purchaseTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* Product Info Card */}
          <div className="rounded-lg bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-lg">{planName}</span>
              <span className="font-bold text-lg">
                {formattedPrice}
                <span className="text-sm font-normal text-muted-foreground">
                  {priceLabel}
                </span>
              </span>
            </div>
          </div>

          {/* Payment Methods */}
          {ENABLE_STRIPE_CARD ? (
            <div>
              <h3 className="font-medium mb-3">{t('selectPaymentMethod')}</h3>
              <RadioGroup
                value={selectedMethod}
                onValueChange={handleMethodChange}
                className="flex flex-col gap-2"
              >
                {/* Credit or debit card */}
                <div className="w-full">
                  <RadioGroupItem
                    value="card"
                    id="card"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="card"
                    className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg border-2 border-muted bg-popover px-4 py-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                  >
                    <CreditCardIcon className="size-5 shrink-0 text-blue-500" />
                    <span className="text-sm font-medium leading-tight">
                      {t('creditOrDebitCard')}
                    </span>
                  </Label>
                </div>

                {/* Crypto */}
                <div className="w-full">
                  <RadioGroupItem
                    value="nowpayments"
                    id="nowpayments"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="nowpayments"
                    className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg border-2 border-muted bg-popover px-4 py-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                  >
                    <BitcoinIcon className="size-5 shrink-0 text-orange-500" />
                    <span className="text-sm font-medium leading-tight">
                      Crypto
                    </span>
                  </Label>
                </div>

                {/* PayPal */}
                <div className="w-full">
                  <RadioGroupItem
                    value="paypal"
                    id="paypal"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="paypal"
                    className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg border-2 border-muted bg-popover px-4 py-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                  >
                    <Image
                      src="/imgs/icons/paypal.svg"
                      alt="PayPal"
                      width={20}
                      height={20}
                      className="shrink-0"
                    />
                    <span className="text-sm font-medium leading-tight">
                      PayPal
                    </span>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          ) : null}

          {/* Payment Content Area */}
          <div className="rounded-lg bg-muted/30 p-4">
            <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
              {/* Card payment content */}
              {ENABLE_STRIPE_CARD && (
                <div
                  className={`flex items-center justify-center ${selectedMethod === 'card' ? '' : 'opacity-0 pointer-events-none'}`}
                >
                  {/* Card icons */}
                  <div className="flex items-center justify-center gap-2">
                    <Image
                      src="/pay/visa.webp"
                      alt="Visa"
                      width={80}
                      height={56}
                      className="h-9 w-auto sm:h-10"
                    />
                    <Image
                      src="/pay/mastercard.webp"
                      alt="Mastercard"
                      width={80}
                      height={56}
                      className="h-9 w-auto sm:h-10"
                    />
                    <Image
                      src="/pay/ae.webp"
                      alt="American Express"
                      width={80}
                      height={56}
                      className="h-9 w-auto sm:h-10"
                    />
                    <Image
                      src="/pay/jcb.webp"
                      alt="JCB"
                      width={80}
                      height={56}
                      className="h-9 w-auto sm:h-10"
                    />
                    <Image
                      src="/pay/union.webp"
                      alt="UnionPay"
                      width={80}
                      height={56}
                      className="h-9 w-auto sm:h-10"
                    />
                  </div>
                </div>
              )}

              {/* NOWPayments content */}
              <div
                className={`flex flex-col items-center justify-center gap-2 text-center ${selectedMethod === 'nowpayments' ? '' : 'opacity-0 pointer-events-none'}`}
              >
                <BitcoinIcon className="size-8 text-orange-500" />
                <div className="font-semibold text-lg">
                  {formattedPrice}
                  <span className="text-sm font-normal">{priceLabel}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Pay with crypto via NOWPayments
                </p>
              </div>

              {/* PayPal payment content */}
              <div
                className={
                  selectedMethod === 'paypal'
                    ? 'space-y-3'
                    : 'opacity-0 pointer-events-none space-y-3'
                }
              >
                {/* Price display */}
                <div className="text-center text-green-600 font-semibold text-lg">
                  {formattedPrice}
                  <span className="text-sm font-normal">{priceLabel}</span>
                </div>

                {/* PayPal Buttons */}
                {paypalClientId ? (
                  <PayPalScriptProvider
                    options={{
                      clientId: paypalClientId,
                      currency: currency.toUpperCase(),
                      intent:
                        mode === 'subscription' ? 'subscription' : 'capture',
                      vault: mode === 'subscription',
                      locale: 'en_US',
                      components: 'buttons',
                      dataNamespace: paypalNamespace,
                    }}
                  >
                    <PayPalButtonsGroup
                      mode={mode}
                      createPayPalOrder={createPayPalOrder}
                      createPayPalSubscription={createPayPalSubscription}
                      onApprove={handlePayPalApprove}
                      onError={handlePayPalError}
                      onCancel={handlePayPalCancel}
                    />
                  </PayPalScriptProvider>
                ) : (
                  <p className="text-center text-muted-foreground py-4">
                    PayPal is not configured
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Pay Now Button (hosted checkout methods) */}
          {ENABLE_STRIPE_CARD && (
            <Button
              className={`w-full h-12 text-base font-medium ${selectedMethod === 'paypal' ? 'invisible' : ''}`}
              onClick={handlePayNow}
              disabled={isLoading || selectedMethod === 'paypal'}
            >
              {isLoading ? (
                <>
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  {t('processing')}
                </>
              ) : (
                t('payNow')
              )}
            </Button>
          )}

          {/* Terms */}
          <p className="text-xs text-center text-muted-foreground">
            {t('termsPrefix')}{' '}
            <Link href="/terms" className="text-primary hover:underline">
              {t('termsOfService')}
            </Link>
            .
          </p>

          {/* Secure Payment Badge */}
          <div className="flex items-center justify-center gap-1 text-green-600">
            <ShieldCheckIcon className="size-4" />
            <span className="text-sm font-medium">{t('securePayment')}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
