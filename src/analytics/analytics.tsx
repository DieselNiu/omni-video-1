import ClarityAnalytics from './clarity-analytics';
import { PlausibleAnalytics } from './plausible-analytics';

/**
 * Analytics Components all in one
 *
 * Plausible + Microsoft Clarity. PostHog is initialized in providers.tsx.
 *
 * docs:
 * https://mksaas.com/docs/analytics
 */
export function Analytics() {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  return (
    <>
      <PlausibleAnalytics />
      <ClarityAnalytics />
    </>
  );
}
