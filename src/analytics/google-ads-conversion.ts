'use client';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type GtagConversionParams = {
  value?: number;
  currency?: string;
  timeoutMs?: number;
};

/**
 * Report a Google Ads conversion by send_to token ("AW-XXXX/YYYY").
 * Best-effort only: missing gtag, blocked scripts, or runtime errors never
 * interrupt the product flow.
 */
export function reportGoogleAdsConversion(
  sendTo: string | undefined,
  params: GtagConversionParams = {}
): Promise<void> {
  if (!sendTo) return Promise.resolve();
  if (typeof window === 'undefined') return Promise.resolve();
  if (typeof window.gtag !== 'function') return Promise.resolve();
  const gtag = window.gtag;

  return new Promise((resolve) => {
    const timeoutMs = params.timeoutMs ?? 2000;
    let settled = false;
    const fallbackTimer = window.setTimeout(finish, timeoutMs);

    function finish() {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallbackTimer);
      resolve();
    }

    try {
      gtag('event', 'conversion', {
        send_to: sendTo,
        value: params.value ?? 1.0,
        currency: params.currency ?? 'USD',
        event_callback: finish,
        event_timeout: timeoutMs,
      });
    } catch (error) {
      console.error('Google Ads conversion reporting failed:', error);
      finish();
    }
  });
}

export function reportPageViewConversion() {
  reportGoogleAdsConversion(
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_PAGE_VIEW
  );
}

export function reportSignupConversion() {
  reportGoogleAdsConversion(
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_SIGNUP
  );
}

export function reportBeginCheckoutConversion() {
  reportGoogleAdsConversion(
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_BEGIN_CHECKOUT,
    { value: 0, currency: 'USD' }
  );
}

export function reportStartGenerateConversion() {
  reportGoogleAdsConversion(
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_START_GENERATE,
    { value: 0, currency: 'USD' }
  );
}

export function reportPurchaseConversion(amount: number, currency = 'USD') {
  return reportGoogleAdsConversion(
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_PURCHASE,
    { value: amount, currency }
  );
}
