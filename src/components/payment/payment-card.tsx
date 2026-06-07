'use client';

import { getRecentPaidPaymentAction } from '@/actions/get-recent-paid-payment';
import { reportPurchaseConversion } from '@/analytics/google-ads-conversion';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { usePaymentCompletion } from '@/hooks/use-payment-completion';
import { useLocaleRouter } from '@/i18n/navigation';
import { PAYMENT_MAX_POLL_TIME, PAYMENT_POLL_INTERVAL } from '@/lib/constants';
import { Routes } from '@/routes';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshCwIcon,
  XCircleIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

type PaymentStatus = 'processing' | 'success' | 'failed' | 'timeout';
const PURCHASE_REDIRECT_TIMEOUT_MS = 2000;

/**
 * Payment card component to display the payment status and redirect to the callback url
 */
export function PaymentCard() {
  const t = useTranslations('Dashboard.settings.payment');
  const localeRouter = useLocaleRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<PaymentStatus>('processing');
  const pollStartTime = useRef<number | undefined>(undefined);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const conversionFiredRef = useRef(false);
  const redirectStartedRef = useRef(false);

  // Get URL parameters
  const callback = searchParams.get('callback');
  const sessionId = searchParams.get('session_id');
  const explicitPayPalOrderId = searchParams.get('paypal_order_id');
  const paypalReturnToken = searchParams.get('token');
  const paypalOrderId = explicitPayPalOrderId ?? paypalReturnToken;
  const paypalSubscriptionId =
    searchParams.get('paypal_subscription_id') ??
    searchParams.get('subscription_id');
  const isPayPalPayment =
    !sessionId &&
    !!callback &&
    !!(explicitPayPalOrderId || paypalSubscriptionId);
  const shouldCapturePayPalReturnOrder =
    !sessionId && !!callback && !explicitPayPalOrderId && !!paypalReturnToken;
  const isPayPalReturnWithoutIdentifiers =
    !sessionId && !!callback && !paypalOrderId && !paypalSubscriptionId;

  // Check payment completion using the existing hook
  const { data: paymentCheck } = usePaymentCompletion(
    sessionId,
    status === 'processing' && !!sessionId
  );

  useEffect(() => {
    if (isPayPalPayment && status === 'processing') {
      setStatus('success');
    }
  }, [isPayPalPayment, status]);

  useEffect(() => {
    if (!shouldCapturePayPalReturnOrder || status !== 'processing') return;

    let isCancelled = false;

    const captureReturnOrder = async () => {
      try {
        const response = await fetch('/api/paypal/capture-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: paypalReturnToken }),
        });

        if (!response.ok) {
          throw new Error('Failed to capture PayPal return order');
        }

        if (!isCancelled) {
          setStatus('success');
        }
      } catch (error) {
        console.error('PayPal return order capture failed:', error);
        try {
          const result = await getRecentPaidPaymentAction({
            paypalOrderId: paypalReturnToken,
          });
          if (!isCancelled && result?.data) {
            setStatus('success');
          }
        } catch (lookupError) {
          console.error('PayPal return order lookup failed:', lookupError);
        }
      }
    };

    void captureReturnOrder();

    return () => {
      isCancelled = true;
    };
  }, [paypalReturnToken, shouldCapturePayPalReturnOrder, status]);

  useEffect(() => {
    if (!isPayPalReturnWithoutIdentifiers || status !== 'processing') return;

    let isCancelled = false;
    let retryTimer: number | undefined;
    const startedAt = Date.now();

    const checkRecentPayPalPayment = async () => {
      try {
        const result = await getRecentPaidPaymentAction({ provider: 'paypal' });
        if (isCancelled) return;

        if (result?.data) {
          setStatus('success');
          return;
        }
      } catch (error) {
        console.error('PayPal recent payment lookup failed:', error);
      }

      if (Date.now() - startedAt > PAYMENT_MAX_POLL_TIME) {
        if (!isCancelled) {
          setStatus('timeout');
        }
        return;
      }

      retryTimer = window.setTimeout(
        checkRecentPayPalPayment,
        PAYMENT_POLL_INTERVAL
      );
    };

    void checkRecentPayPalPayment();

    return () => {
      isCancelled = true;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [isPayPalReturnWithoutIdentifiers, status]);

  // Handle payment completion polling and timeout
  useEffect(() => {
    if (sessionId && status === 'processing') {
      pollStartTime.current = Date.now();

      const checkTimeout = () => {
        if (pollStartTime.current) {
          const elapsed = Date.now() - pollStartTime.current;
          if (elapsed > PAYMENT_MAX_POLL_TIME) {
            setStatus('timeout');
            return;
          }
        }
        // Continue checking if still processing
        if (status === 'processing') {
          timeoutRef.current = setTimeout(checkTimeout, PAYMENT_POLL_INTERVAL);
        }
      };

      checkTimeout();
    }

    // Cleanup function, clear timeout
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [sessionId, status]);

  // Handle payment completion, if payment is paid, change status to success
  useEffect(() => {
    if (paymentCheck?.isPaid && status === 'processing') {
      setStatus('success');
    }
  }, [paymentCheck, status]);

  const redirectToCallback = useCallback(async () => {
    if (!callback || redirectStartedRef.current) return;
    redirectStartedRef.current = true;

    try {
      if (callback === Routes.SettingsCredits) {
        await queryClient.invalidateQueries({
          queryKey: ['credits'],
        });
        await queryClient.refetchQueries({
          queryKey: ['credits'],
        });
        console.log('Refetched credits cache for credits page');
      } else if (callback === Routes.SettingsBilling) {
        await queryClient.invalidateQueries({
          queryKey: ['payment'],
        });
        await queryClient.refetchQueries({
          queryKey: ['payment'],
        });
        console.log('Refetched payment cache for billing page');
      }
    } catch (error) {
      console.error('payment redirect cache refresh failed:', error);
    } finally {
      localeRouter.push(callback);
    }
  }, [callback, localeRouter, queryClient]);

  useEffect(() => {
    if (status !== 'success') return;
    let isMounted = true;
    const RETRY_DELAYS_MS = [0, 2000, 5000, 10000, 20000, 30000, 60000];

    const delayFor = (ms: number) =>
      new Promise((resolve) => window.setTimeout(resolve, ms));

    const reportConversion = async () => {
      if (conversionFiredRef.current) return;
      conversionFiredRef.current = true;

      for (const delay of RETRY_DELAYS_MS) {
        if (delay > 0) await delayFor(delay);
        try {
          const result = await getRecentPaidPaymentAction(
            sessionId
              ? { sessionId }
              : paypalOrderId
                ? { paypalOrderId }
                : paypalSubscriptionId
                  ? { paypalSubscriptionId }
                  : isPayPalReturnWithoutIdentifiers
                    ? { provider: 'paypal' }
                    : undefined
          );
          const data = result?.data;
          if (!data) continue;
          if (typeof window === 'undefined') return;
          const dedupKey = `purchase_conversion_fired_${data.txnId}`;
          if (window.localStorage.getItem(dedupKey)) return;
          await reportPurchaseConversion(data.amount, data.currency);
          window.localStorage.setItem(dedupKey, '1');
          return;
        } catch (error) {
          console.error('purchase conversion lookup failed:', error);
          return;
        }
      }
    };

    void (async () => {
      try {
        await Promise.race([
          reportConversion(),
          delayFor(PURCHASE_REDIRECT_TIMEOUT_MS),
        ]);
      } finally {
        if (isMounted) {
          await redirectToCallback();
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [
    status,
    sessionId,
    paypalOrderId,
    paypalSubscriptionId,
    isPayPalReturnWithoutIdentifiers,
    redirectToCallback,
  ]);

  // Cleanup on unmount, clear timeout
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const getStatusIcon = () => {
    switch (status) {
      case 'processing':
        return (
          <RefreshCwIcon className="h-12 w-12 text-cyan-600 animate-spin" />
        );
      case 'success':
        return <CheckCircleIcon className="h-12 w-12 text-green-600" />;
      case 'failed':
        return <XCircleIcon className="h-12 w-12 text-red-600" />;
      case 'timeout':
        return <AlertCircleIcon className="h-12 w-12 text-yellow-600" />;
      default:
        return <RefreshCwIcon className="h-12 w-12 text-gray-600" />;
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'processing':
        return {
          title: t('processing.title'),
          description: t('processing.description'),
        };
      case 'success':
        return {
          title: t('success.title'),
          description: t('success.description'),
        };
      case 'failed':
        return {
          title: t('failed.title'),
          description: t('failed.description'),
        };
      case 'timeout':
        return {
          title: t('timeout.title'),
          description: t('timeout.description'),
        };
      default:
        return { title: '', description: '' };
    }
  };

  const { title, description } = getStatusMessage();

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center py-4">
          <div className="flex justify-center mb-8">{getStatusIcon()}</div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
