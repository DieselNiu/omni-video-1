# TODOS

Architecture issues and follow-ups surfaced while instrumenting the cooldown →
purchase funnel in April 2026. Parked here so we come back to them once PostHog
funnel data is flowing and we know which ones actually matter.

---

## Analytics follow-ups (P1, do after first data week)

- [ ] **`image_generation_submitted / _succeeded / _failed`** on the generic path
      in `src/app/api/image-generation/submit/route.ts`. Right now only the
      `isNanoFamily` branch emits events (`nano_generation_*`), so Grok /
      non-nano generations are invisible. Properties:
      `{ userId, modelId, provider, mode, resolution, aspectRatio, creditsUsed }`;
      failure events add `{ reason, errorMessage }`.
- [ ] **`anon_first_generation`** — emitted once per fingerprint when a guest
      completes their first generation, with referrer + UTM attribution.
      Enables the anon → signup funnel.
- [ ] **`signup_completed`** — tied to Better Auth. Must include prior anon
      fingerprint if recoverable from cookie, otherwise the anon → signup
      funnel will undercount by the posthog.identify merge rate.
      **Why this is the critical missing piece right now:** the P0 funnel only
      covers logged-in users. Anon users who hit the 5-image wall see a login
      modal (not UpgradeDialog) — we fire `free_quota_cooldown_hit` with
      `subjectType='guest'` but have no event for what they do next. Without
      `signup_completed`, the anon → signup → paid conversion chain has a
      dead segment in the middle and we can't answer "is the 5-image anon
      quota the right wedge?".
- [ ] **`signup_prompt_shown`** — fires when the anon-exhausted login modal
      opens. Pairs with `signup_completed` to measure "saw the prompt → signed
      up" conversion cleanly.
- [ ] **`checkout_session_created`** — in `create-credit-checkout-session.ts`
      (and the Stripe subscription action if subscriptions stay a product).
      Needed to compute checkout abandon rate (Stripe success page traffic
      minus `credit_purchase_completed`).
- [ ] Before shipping to prod, restore the `NODE_ENV === 'production'` gate
      in `src/analytics/posthog-analytics.tsx`. It is temporarily lifted so
      local instrumentation can be verified in dev.

---

## Architecture / product issues (revisit once funnel data is in)

### 1. Dead config flags that look live

Several `features.*` flags in `src/config/website.tsx` are defined but never
read by runtime code, so toggling them in config does nothing. Actual behaviour
is gated by env vars. Causes social-engineering traps for future maintainers.

- `features.enableNsfwDetection` (website.tsx:48) — ignored;
  `src/lib/nsfw/detect.ts:75-93` actually gates on `OPENAI_API_KEY`.
- `features.enablePaypal` (website.tsx:113) — ignored;
  `src/components/pricing/payment-checkout-dialog.tsx:197,593` gates on
  `NEXT_PUBLIC_PAYPAL_CLIENT_ID`.

**Fix:** either wire the flags into the runtime checks, or delete them from
config. Pick one. Half-wired is worst of both worlds.

### 2. NsfwUpgradeDialog sells subscriptions; main UpgradeDialog sells credit packs

`src/components/pricing/nsfw-upgrade-dialog.tsx` renders
`lite` / `pro` / `pro.tiers` from `website.tsx:116-270` as `$29.9/mo`-style
subscriptions. Main `UpgradeDialog` only sells one-time credit packs and
explicitly says "no subscription" in its benefit copy. Two inconsistent
business models depending on which modal trips.

**Options documented in** `~/.gstack/projects/DieselNiu-gptimage2/*` notes:
A) change NsfwUpgradeDialog to credit packs (keeps one business model),
B) remove NsfwUpgradeDialog and just block NSFW without monetising,
C) unify main dialog to also support subscriptions.

Don't touch this until `upgrade_dialog_opened` with `trigger='nsfw_block'`
tells us how often this dialog actually fires.

### 3. Stripe vs PayPal subscription value delivery divergence

Same `$29.9/mo lite` subscription, two different outcomes depending on
payment rail:

- **Stripe subscription →** `src/payment/provider/stripe.ts:730-741`
  `processSubscriptionPurchase` calls `addSubscriptionCredits` (gives
  monthly credits, finite).
- **PayPal subscription →** `src/payment/provider/paypal.ts:717, 837`
  `grantNanoFamilyEntitlementForSubscription` (gives nano entitlement,
  unlimited generation for the window).

UI doesn't disclose this. Users are silently put into different value
buckets based on payment rail. Either a true bug or a hidden feature that
should be explicit.

**Blocker:** need `SELECT` on `user_entitlement` + `payment` tables to
size the impact before deciding whether to backfill Stripe users,
migrate PayPal users, or delete the entitlement path entirely.

### 4. Dead code paths that should be cleaned once (2) + (3) resolve

Once NsfwUpgradeDialog moves to credit packs (option A above), the
following become unreachable from the product and can be deleted:

- `grantNanoFamilyEntitlementForSubscription` (entitlements.ts:121)
- `isYearlyNanoEntitledPriceId`, `deriveEntitlementSource` (entitlements.ts)
- `trackServerEvent('pricing_yearly_pro_checkout_completed')`
  (entitlements.ts:173) — already duplicates `nano_entitlement_granted`
  with identical properties
- `addSubscriptionCredits`, `processSubscriptionPurchase`,
  `createSubscriptionPaymentRecord` (stripe.ts)
- PayPal subscription endpoints: `/api/paypal/create-subscription`,
  `/api/paypal/confirm-subscription`, subscription branches in
  `paypal.ts:717, 837`
- Subscription plan blocks `lite` / `pro` / `pro.tiers` / `premium` in
  `website.tsx:116-270`
- `PricingTable`, `MergedPricingCard`, `PricingCard`, `UpgradeDialogPricingPanel`
  in `src/components/pricing/` — subscription-aware pricing components
  that no current route renders
- `hasActiveEntitlement` call at `submit/route.ts:91-99` — always false
  once no entitlements can be minted
- `nano_generation_entitlement_used` event branch — dead once no
  entitlements exist
- `userEntitlement` DB table — keep for historical data; only delete
  after any PayPal subscription users with active entitlements have
  expired or been migrated

### 5. Misleading event name

`nano_generation_credit_fallback_used` (submit/route.ts:211) implies
a "fallback" path relative to a "primary" entitlement path. Once the
entitlement path is confirmed dead/rare, rename to
`nano_generation_credit_used` to stop confusing future readers.

### 5a. Misleading quota policy name (blocked on DB migration)

`FREE_QUOTA_POLICY.USER_FREE_10MIN` in `src/credits/free-quota.ts:19-22`
is a lie. The actual cooldown is `DEFAULT_USER_COOLDOWN_MINUTES = 60`
minutes, not 10. Name is historical — the cooldown was probably lengthened
from 10 → 60 min at some point and the constant never got renamed.

**Why it wasn't fixed in the analytics PR:** the constant's string value
(`'USER_FREE_10MIN'`) is stored in the `quota_bucket.policy` column for
every existing logged-in user. Renaming the code constant without a DB
migration would cause `bucket.policy === FREE_QUOTA_POLICY.USER_FREE_60MIN`
checks to fail for all existing rows, funneling every logged-in user
who hits the wall down the anon code path (login modal instead of
cooldown countdown). A prominent comment is now in place at the
definition site so future readers aren't misled.

**Proper fix (do as own PR):**
1. Rename constant key everywhere: `USER_FREE_10MIN` → `USER_FREE_60MIN`.
2. Change the string value to `'USER_FREE_60MIN'`.
3. Migration: `UPDATE quota_bucket SET policy = 'USER_FREE_60MIN' WHERE policy = 'USER_FREE_10MIN';`
4. Deploy code + migration atomically (or add a transitional check that
   accepts both string values for one deploy cycle, then remove).

### 6. Non-nano models have no success/failure telemetry

`src/app/api/image-generation/submit/route.ts` only emits events inside
`if (isNanoFamily) { ... }`. Grok Imagine (wired in at `feat: add Grok
Imagine backend behind MAXAPI_IMAGE_BACKEND switch`) generates are
completely invisible. Makes it impossible to answer
"is Grok's success rate better than OpenAI's?" or "did the recent
user-friendly-error fix actually reduce failures?".

Covered by the P1 analytics `image_generation_*` item above.

---

## Process learnings

- Boilerplate config flags in this codebase are not trustworthy without
  grepping their usage. Several look load-bearing but are dead. Future
  audits should verify wiring before drawing conclusions.
- PayPal is live for credit purchases even when `enablePaypal: false`.
  The `NEXT_PUBLIC_PAYPAL_CLIENT_ID` env var is the real switch.
