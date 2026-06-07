import { GoogleAnalytics as NextGoogleAnalytics } from '@next/third-parties/google';

/**
 * Google Ads (gtag.js)
 *
 * Uses the same gtag loader as Google Analytics. Passing an AW-* ID loads the
 * Google Ads conversion tag globally, while individual conversion events are
 * fired explicitly through google-ads-conversion.ts.
 */
export default function GoogleAds() {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  if (!adsId) {
    return null;
  }

  return <NextGoogleAnalytics gaId={adsId} />;
}
