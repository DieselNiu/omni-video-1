import { PostHog } from 'posthog-node';

type AnalyticsProps = Record<string, unknown> & {
  userId?: string | null;
  distinctId?: string;
};

let cachedClient: PostHog | null = null;

function getClient(): PostHog | null {
  if (cachedClient) return cachedClient;
  // PostHog project tokens are write-only public keys by design, so the
  // server can read the same NEXT_PUBLIC_* variable the browser uses.
  // If you ever need a privileged server-only PostHog key (Personal API
  // key for reads / deletes / feature-flag admin), add a separate env
  // var — don't conflate it with this project token.
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return null;

  // flushAt:1 + flushInterval:0 forces immediate send per capture. Required
  // because Next.js serverless functions terminate right after the response,
  // which would otherwise drop batched events still sitting in memory.
  cachedClient = new PostHog(key, {
    host,
    flushAt: 1,
    flushInterval: 0,
  });
  return cachedClient;
}

export function trackServerEvent(event: string, properties?: AnalyticsProps) {
  // Keep the log line so server-side events remain visible in stdout/Vercel
  // logs even when PostHog is not configured or the request is local.
  console.info('[analytics]', event, properties || {});

  const client = getClient();
  if (!client) return;

  const { userId, distinctId, ...rest } = properties ?? {};

  // distinctId resolution order:
  //   1. explicit `distinctId` (caller knows best)
  //   2. `userId`               (logged-in server events)
  //   3. `fingerprint`          (guest / anon server events — same fingerprint
  //                              the client SDK uses, so client + server events
  //                              for the same anon visitor merge into one person)
  //   4. `subjectId`            (quota-bucket subject, stable for anon too)
  //   5. STABLE synthetic id    (per-event-name, NOT per-call — a wall-clock
  //                              fallback would fragment one "person per event"
  //                              and poison funnel counts)
  //
  // Never fall back to Date.now() / randomUUID() — anonymous events must
  // coalesce into a consistent distinct_id, even if we can't tell WHICH
  // anon it is. Better to attribute to a synthetic bucket than to shatter
  // the data.
  const fingerprint =
    typeof rest.fingerprint === 'string' ? rest.fingerprint : null;
  const subjectId = typeof rest.subjectId === 'string' ? rest.subjectId : null;

  const resolvedDistinctId =
    distinctId ?? userId ?? fingerprint ?? subjectId ?? `anon-server:${event}`;

  try {
    client.capture({
      distinctId: resolvedDistinctId,
      event,
      properties: {
        ...rest,
        ...(userId ? { userId } : {}),
      },
    });
  } catch (error) {
    console.warn('[analytics] capture failed:', error);
  }
}
