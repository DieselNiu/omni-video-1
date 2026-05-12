'use client';

type AnalyticsProps = Record<string, unknown>;
type PlausibleFn = (
  event: string,
  options?: { props?: AnalyticsProps }
) => void;
type UmamiFn = ((event: string, properties?: AnalyticsProps) => void) & {
  track?: (event: string, properties?: AnalyticsProps) => void;
};

async function getPostHog() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const { default: posthog } = await import('posthog-js');
    return posthog;
  } catch (error) {
    console.warn('posthog load error:', error);
    return null;
  }
}

export function trackEvent(event: string, properties?: AnalyticsProps) {
  if (typeof window === 'undefined') return;

  void getPostHog()
    .then((posthog) => {
      posthog?.capture(event, properties);
    })
    .catch((error) => {
      console.warn('trackEvent error:', error);
    });

  const plausible = (window as unknown as { plausible?: PlausibleFn })
    .plausible;
  if (typeof plausible === 'function') {
    plausible(event, { props: properties });
  }

  const umami = (window as unknown as { umami?: UmamiFn }).umami;
  if (typeof umami === 'function') {
    if (typeof umami.track === 'function') {
      umami.track(event, properties);
    } else {
      umami(event, properties);
    }
  }
}
