import { PlausibleAnalytics } from './plausible-analytics';

/**
 * Analytics Components all in one
 *
 * Only Plausible is loaded here. PostHog is initialized in providers.tsx.
 * Other vendors (GA/Umami/Ahrefs/DataFast/OpenPanel/Seline/Clarity/Vercel)
 * were removed to cut JS payload and main-thread work.
 *
 * docs:
 * https://mksaas.com/docs/analytics
 */
export function Analytics() {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  return <PlausibleAnalytics />;
}
