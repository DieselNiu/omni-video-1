# Model Registry Migration — gptimage2

Port the two-layer ProductModel / ExecutableModel registry from the sister
project `image-website` (see its `src/models/` and commits `6cb2907` →
`12f6a37`) into gptimage2. Goal: kill the "nano-banana wearing a GPT Image 2
skin" confusion and make "switch apimart upstream to maxapi upstream" a
one-line change.

## Guiding principles

1. **Additive first, destructive last.** New registry runs alongside legacy
   `IMAGE_MODELS` until equivalence tests pass. Nothing gets deleted in Phase
   1 or Phase 2.
2. **Quota code is untouchable.** `quota_bucket`, `guest_generation`,
   `consumeFreeQuota`, `claimGuestQuota`, `refundFreeQuota` — zero changes
   across all phases. Regression-test the 5-free-then-login flow at every
   phase boundary.
3. **External vs internal ID separation.** Product id = what the URL / DB
   `asset.modelId` / user-facing credits refer to. Executable id = what the
   provider dispatch actually runs. One row in the DB gets both.
4. **Rollback cheap.** Each phase is a standalone PR behind a feature flag
   where possible. Reverting one phase never forces reverting the previous.

## Scope — what gptimage2 actually needs

Smaller than image-website. gptimage2's registered image models today:

- `nano-banana-pro` (displayName "GPT Image 2", MaxAPI default, Kie fallback)
- `nano-banana` (T2I only)
- `nano-banana-edit` (I2I only)

Planned additions driven by this refactor:

- `gpt-image-2` ProductModel (own family, own slug) — current displayName
  "GPT Image 2" migrates here, its executable binds to apimart
- At least one alternate executable (future: maxapi's gpt-image-2) to prove
  the resolver can swap vendors without touching product id

Out of scope for this migration: video models (gptimage2 has none), marketing
pages, picker two-level UI (gptimage2 picker is already flat).

---

## Phase 1 — Registry data layer (additive)

**Goal**: New `src/models/` directory with types, registry, and data; legacy
code path unchanged. Zero runtime behavioral diff.

### Files to create

| File | Source reference | Adjustments for gptimage2 |
|---|---|---|
| `src/models/types.ts` | Copy from image-website verbatim | Trim `VideoModality`, `VideoCapabilities`, `VideoExecutableModel`, `VideoProductModel`, video branches of `ProviderOptionsMap` |
| `src/models/registry.ts` | Copy | Remove video validators, keep 4 (id uniqueness, resolver target exists, capabilities subset, pricing ≥ cost) |
| `src/models/image-models.ts` | New — gptimage2 specific | Register 3 legacy nano-banana products + 1 new `gpt-image-2` product |
| `src/models/derive.ts` | Copy image sections | Only needs `deriveImageModels()` to reconstruct legacy `IMAGE_MODELS` shape |
| `src/models/selectors.ts` | Copy image sections | Only needs `listProducts`, `getProductById`, `getProductBySlug` |
| `src/models/registry.test.ts` | Copy image sections | Equivalence tests vs current `IMAGE_MODELS` |

### ProductModel / ExecutableModel inventory

```
ExecutableModels (6):
  nano-banana-pro           family=nano-banana  version=pro    binding.provider=maxapi
  nano-banana               family=nano-banana  version=1      binding.provider=maxapi
  nano-banana-edit          family=nano-banana  version=edit   binding.provider=maxapi
  gpt-image-2-apimart       family=gpt-image    version=2      binding.provider=apimart   apiModelId='gpt-image-2'

ProductModels (4):
  nano-banana-pro           resolver.fallback=nano-banana-pro
  nano-banana               resolver.fallback=nano-banana
  nano-banana-edit          resolver.fallback=nano-banana-edit
  gpt-image-2               resolver.fallback=gpt-image-2-apimart
                            (future vendor swap = add new ExecutableModel + flip fallback; one-line change)
```

The 4th product is the refactor's main prize — it's the thing that today is
faked by `nano-banana-pro` + a `displayName` override + apimart provider skin.

### DB prep

Add nullable columns (mirrors image-website `0029_add_dual_model_ids.sql`):

```sql
ALTER TABLE asset ADD COLUMN external_model_id TEXT;
ALTER TABLE asset ADD COLUMN internal_model_id TEXT;
ALTER TABLE guest_generation ADD COLUMN external_model_id TEXT;
ALTER TABLE guest_generation ADD COLUMN internal_model_id TEXT;
```

**Dual-write, no read**: update `createAsset` / `createGuestGeneration` to
write `external_model_id = internal_model_id = modelId` (preserving
byte-identical pre-refactor behavior). Legacy `modelId` column keeps being
authoritative on read in Phase 1.

### Validation gate

- 81-style equivalence tests: for every legacy `IMAGE_MODELS[id]`, assert
  `deriveImageModels()[id]` is deep-equal
- Startup validators block boot if any registered product/executable fails
  invariants
- `pnpm lint && pnpm build` clean

### Exit criteria

- [ ] Registry module loads without errors on boot
- [ ] All equivalence tests pass (target: 100% parity with legacy
  `IMAGE_MODELS`)
- [ ] Zero production code imports from `@/models/*` yet (grep check)
- [ ] DB migration applied in dev; columns exist, all NULL
- [ ] `pnpm dev` works, guest+authed flows unchanged (smoke: generate an
  image signed out and signed in)

### Rollback

Delete the `src/models/` directory, revert the migration. Nothing downstream
depends on it.

---

## Phase 2 — Read path cutover (one file at a time)

**Goal**: Replace each `IMAGE_MODELS[modelId]` lookup with
`getProductById(modelId)` (or `resolve()` when context is needed). Each file
is its own PR so regressions are bisectable.

### Cutover order (dependency-safe)

1. `src/image/config/image-models.ts`
   - Make `IMAGE_MODELS` = `deriveImageModels()` call (cached)
   - `DEFAULT_IMAGE_MODEL` stays `'nano-banana-pro'` for one more phase
   - `calculateImageCredits` reads `product.pricing.externalCredits` instead
     of the `modelId === 'nano-banana-pro'` branch
   - `getImageModelOptionsByMode` iterates registry public products
2. `src/app/api/image-generation/submit/route.ts`
   - Call `registry.resolve({ productId: modelId, context: { hasInputImage } })`
   - Write `external_model_id = result.externalModelId`,
     `internal_model_id = result.internalModelId` explicitly alongside
     existing `modelId` column
   - Pass `result.executable` to provider dispatch
3. `src/app/api/image-generation/status/route.ts`
   - Status route reads record's `modelId` (now still populated); no change
     needed unless we want to return `external_model_id` in DTO
4. `src/app/api/home/image/submit/route.ts`
   - Replace `HOME_IMAGE_ALLOWED_MODEL_ID = 'nano-banana-pro'` with
     `registry.getProductBySlug('gpt-image-2').id` (or whichever product the
     home flow should expose; see Phase 2 decision point below)
   - Quota code stays untouched
5. `src/image/index.ts` `getImageProvider`
   - Take `executable` (not raw modelId) as input
   - Replace `/nano-banana/i` regex with `executable.family + ':' +
     executable.version`
   - `apiModelId` and `provider` come from `executable.binding` directly
6. Provider files (`ApimartProvider`, `MaxAPINanoBananaProvider`,
   `KieNanoBananaProvider`, etc.)
   - Signature changes from `submit(modelId, input)` to `submit(executable, input)`
   - Internal `MODEL_ID_MAP` tables become thin wrappers over
     `executable.binding.apiModelId` (or deleted entirely)
7. Frontend
   - `getImageModelOptionsByMode` becomes `listProducts({ kind: 'image',
     visibility: 'public' }).map(toOption)`
   - `DEFAULT_IMAGE_MODEL` stays a const but is re-exported from
     `selectors.ts`

### Phase 2 decision point — what does "GPT Image 2" point to?

Before step 4, decide **which product** the public gptimage2 site exposes.
Two options:

- **A (conservative)**: Home route still serves `nano-banana-pro` product;
  frontend label is already "GPT Image 2" so users see no change. `gpt-image-2`
  product exists in registry but is internal/not surfaced. This defers the
  real rename to Phase 4.
- **B (aggressive)**: Home route switches to the new `gpt-image-2` product
  immediately. Old URLs bookmarked as `/image/nano-banana-pro` go to 404 or
  redirect via `legacySlugs: ['nano-banana-pro']`.

Recommend **A for Phase 2**, **B scheduled for Phase 4** after Phase 3
stabilizes. Guest quota flow is unaffected either way since `quotaBucket`
doesn't key on modelId.

### Exit criteria

- [ ] Every `IMAGE_MODELS[` / `getImageModel(` usage migrated or deleted
- [ ] `grep -r "nano-banana-pro" src/ --exclude=src/models/` returns only
      `DEFAULT_IMAGE_MODEL` const and legacy compat shims
- [ ] Guest 5-free flow: manual test before and after cutover, screenshots
      attached to PR
- [ ] Authed unlimited flow: generate 3 images, verify `asset` rows have
      both `modelId` and `external_model_id`/`internal_model_id` populated
- [ ] Prod logs: `[ImageProvider]` line shows
      `family=gpt-image version=2 channel=apimart` when gpt-image-2 is
      exercised

### Rollback

Per-file revert. Since DB still writes legacy `modelId` column, no data
migration needed to roll back individual steps.

---

## Phase 3 — Channel router + vendor swap validation

**Goal**: Prove the core value prop ("swap vendor without touching
product id") with an actual swap.

### Tasks

1. `src/lib/channel-router.ts`
   - `DEFAULT_CHANNELS` keyed by `family:version` (e.g. `gpt-image:2`)
     matching image-website's scheme
   - Read from `executable.family:executable.version` (no regex)
   - Remove the `'nano-banana': 'apimart'` line I hardcoded earlier; it
     becomes `'gpt-image:2': 'apimart'` + `'nano-banana': 'maxapi'`
2. Vendor swap dry-run
   - Temporarily register a second ExecutableModel (e.g. `gpt-image-2-maxapi`
     stub) and flip `gpt-image-2` ProductModel's `resolver.fallbackExecutableId`
     on a branch
   - Run the integration test for a single generate call; confirm dispatch
     goes to the new executable
   - Revert the branch. This is purely a rehearsal to prove the mechanism
     works without committing a stub to main.
3. Add `channel_config` DB row support for per-env overrides
   - Already supported; just document that `modelFamily='gpt-image'`,
     `modelVersion='2'` is the right way to override in prod
4. **Env-var override layer** (satisfies original requirement ⑤:
   "switch vendor via env var any time")
   - Add a typed env-read helper to `channel-router.ts`:
     `getEnvChannelOverride(family, version)` reads
     `IMAGE_VENDOR__<FAMILY_UPPER>_<VERSION>` (e.g.
     `IMAGE_VENDOR__GPT_IMAGE_2=maxapi`,
     `IMAGE_VENDOR__NANO_BANANA=kie`)
   - Priority order for `getActiveChannel()`:
     1. Env var override (highest) — dev iteration, emergency vendor swap
     2. `channel_config` DB row — per-env / gradual rollout
     3. Registry default (`DEFAULT_CHANNELS[family:version]`) — baseline
   - Env-overridden channel must still resolve to a registered
     ExecutableModel. Startup validation: if env is set, the target
     executable must exist in the registry (otherwise log warning, fall
     through to layer 2)
   - Register accepted env var names in `env.example` with comments
   - Kill the legacy `MAXAPI_IMAGE_BACKEND=grok` ad-hoc switch inside
     `factory.ts` — fold its behavior into the same env scheme (if needed,
     `IMAGE_VENDOR__GROK=maxapi` or similar, depending on how we model
     Grok as a product family)

### Exit criteria

- [ ] `channel-router.ts` has zero hardcoded `nano-banana-pro` / `apimart`
      references — all routing decisions come from registry + `channel_config`
- [ ] Swap rehearsal passes (manual)
- [ ] Staging env has `channel_config` row driving the routing; disabling
      that row falls back to the registry default
- [ ] Env override verified: set `IMAGE_VENDOR__GPT_IMAGE_2=<other-vendor>`
      in `.env.local`, restart dev server, generation log shows the new
      channel. Unset the env, generation returns to the registry default.
      No code, no DB change required for this round-trip.
- [ ] `env.example` documents every accepted `IMAGE_VENDOR__*` name

---

## Phase 4 — Legacy cleanup (destructive)

**Goal**: Delete dead code. Only after Phases 1–3 have been in prod ≥ 1
week with zero incidents.

### Deletions

- `src/image/config/image-models.ts` `IMAGE_MODELS` constant (now derived)
- `HOME_IMAGE_ALLOWED_MODEL_ID` const (replaced by registry lookup)
- `MODEL_ID_MAP` tables inside each provider
- Any "displayName override" hacks left over from the nano-banana-pro → GPT
  Image 2 skin
- `MAXAPI_IMAGE_BACKEND` env var (replaced by `IMAGE_VENDOR__*` scheme in
  Phase 3). Keep a deprecation shim for one release: if set, log a warning
  and map it to the new var.

### Renames (require data migration)

- `asset.modelId` → deprecated; reads switch to `external_model_id`
- Optional: DB backfill `external_model_id = modelId` for historical rows
  (one-time SQL, fast — asset table is not huge)

### Exit criteria

- [ ] `grep -r "IMAGE_MODELS\|nano-banana-pro" src/` returns only historical
      references (migrations, comments)
- [ ] Bundle size diff: expect ~-200 to -400 LOC removed
- [ ] All tests pass, prod metrics (error rate, P95 generation latency)
      unchanged

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Quota flow regression during Phase 2 cutover | Low | Quota code not touched; add explicit regression test that exercises 5-anon-then-login at each phase |
| Home route cutover breaks guest 6th-request block | Low | Only `HOME_IMAGE_ALLOWED_MODEL_ID` changes; quota gate runs before model resolution |
| DB dual-id divergence (external ≠ internal) | Medium | Phase 1 writes them equal to `modelId`; Phase 2 writes them from `resolve()` result; Phase 4 reads from new columns. Each phase keeps the old column populated. |
| Legacy URL 404s after Phase 4 | N/A | gptimage2 has no `/image/[model]/` route; `nano-banana-pro` never appears in a URL, so no redirects needed |
| Equivalence tests miss a behavior (e.g. credits off by 1) | Low | Phase 1 tests are byte-for-byte on `IMAGE_MODELS` shape + route-level integration test generates an image and inspects `asset` row |
| Third-party apimart flakes during rehearsal | Low | Phase 3 swap rehearsal uses stub/canary, not prod traffic |

## Estimated effort

| Phase | Effort | Depends on |
|---|---|---|
| Phase 1 — registry + DB migration | 0.5 day | — |
| Phase 2 — read path cutover | 1–1.5 days | Phase 1 |
| Phase 3 — channel router + env override + rehearsal | 0.75 day | Phase 2 |
| Phase 4 — cleanup | 0.25 day (+ 1 week soak time) | Phase 3 in prod |

**Total coding time: ~2.75 days.** Soak time between Phase 3 and Phase 4
brings calendar time to ~1.5 weeks.

## What this migration does NOT do

- Does not redesign the free-quota system (still 5 guest / unlimited paid)
- Does not change credit pricing or Stripe products
- Does not touch `nsfw` detection, watermarking, R2 upload, webhook handlers
- Does not rename the `channel_config` table or its columns
- Does not add a plan/purchase gate on any model (those live in
  `ProductModel.policy.paidOnly`, default false for everything)

## Product decisions (confirmed)

- **Single-product consolidation**: Phase 4 collapses `nano-banana-pro` into
  `gpt-image-2`. gptimage2 has no `/image/[model]/` public page, so there are
  no URLs to redirect and no SEO impact. Historical `asset.modelId` and
  `external_model_id='nano-banana-pro'` rows are left as-is for audit
  continuity; all new writes use `gpt-image-2`. Frontend picker shows only
  "GPT Image 2". If a cheaper tier is ever wanted later, a new ProductModel
  can be split off without touching `gpt-image-2`.
- **Flat pricing**: `gpt-image-2` stays at flat 3 credits per generation
  (mirroring apimart's flat pricing). No 1K/2K/4K resolution tiering.
  `ProductModel.pricing.externalCredits = 3` (not a `ResolutionPricing`
  object).
- **Vendor failover**: manual only. When maxapi (or any other vendor) ships
  `gpt-image-2`, switching is a one-line change to the ProductModel
  `resolver.fallbackExecutableId` (or a `channel_config` DB row). No
  automatic failover / retry-on-other-vendor logic — if apimart is down,
  requests fail and users retry. This keeps the mental model simple:
  one product → one executable → one upstream at any given time.
