/**
 * Model Registry — Core Types (image-only)
 *
 * Two-layer modeling:
 *   - ProductModel:    user-facing identity (slug, display name, pricing, policy).
 *   - ExecutableModel: what actually runs against a provider (binding, capabilities, cost).
 *
 * A ProductModel routes to an ExecutableModel via a declarative `resolver` rule table.
 * Simple 1:1 models are "resolver with no rules, only fallback". Virtual/alias models
 * are "resolver whose fallback points to another family's executable" — this is how
 * we model "frontend shows GPT Image 2, backend calls nano-banana".
 *
 * Ported from sister project image-website/src/models/types.ts with video branches
 * trimmed. See docs/model-registry-migration.md.
 *
 * Type-level invariants:
 *   - Image products and executables only; video support not in this project.
 *   - Provider-specific options are typed per-provider via ProviderOptionsMap;
 *     Binding is a discriminated union by provider kind, so writing a kie option
 *     onto a maxapi binding fails at compile time.
 *   - Provider kind literals match the runtime/channel-router vocabulary exactly
 *     (the string passed to provider dispatch code). No aliasing layer.
 */

// ============================================================================
// Enums / primitive domains
// ============================================================================

/** Fine-grained image modalities. */
export type ImageModality = 't2i' | 'i2i' | 'edit';
export type ModelModality = ImageModality;

/**
 * Model family — brand-level grouping identity. Use `family` + `version` as the
 * structured addressing scheme; channel-router builds routing keys like
 * `'nano-banana:pro'` / `'gpt-image:2'`.
 */
export type ModelFamily = 'nano-banana' | 'gpt-image';

/**
 * Provider kind literals. MUST match the runtime vocabulary used by
 * channel-router.ts and the ImageChannel type in src/image/providers/types.ts —
 * there is no translation layer between registry and provider dispatch.
 */
export type ProviderKind = 'kie' | 'maxapi' | 'apimart' | 'google' | 'vertex';

export type Resolution = '1K' | '2K' | '4K';

/**
 * Resolution-based pricing. Values are flat credits-per-image.
 * gptimage2's single-tier products use `number` directly; tiered products
 * (e.g. legacy nano-banana-pro) use the Partial record form.
 */
export type ResolutionPricing = Partial<Record<Resolution, number>>;

// ============================================================================
// Capabilities
// ============================================================================

export interface ImageCapabilities {
  supportedAspectRatios: string[];
  supportedResolutions?: Resolution[];
  supportedFormats: string[];
  maxInputImages?: number;
}

export type Capabilities = { kind: 'image'; image: ImageCapabilities };

// ============================================================================
// Provider-specific typed options
// ============================================================================

/**
 * Known provider-specific request options. Each provider owns its slot.
 * Shapes are minimal — only add a field when it replaces a runtime branch.
 */
export interface ProviderOptionsMap {
  /** Kie.ai — Nano Banana body shape selector. */
  kie: {
    bodyVersion?: 'v2' | 'legacy' | 'gpt-image-2';
  };
  /**
   * MaxAPI — multiplexes upstreams behind one API key. Keep in sync with
   * src/image/providers/factory.ts:getChannelVariant.
   *
   * - `backend`:  picks which MaxAPI sub-provider class to instantiate
   *               (nano-banana default vs grok). Also honored by factory.ts.
   * - `grokTier`: tier selector for MaxAPIGrokProvider. Defaults to
   *               'lite' when undefined.
   */
  maxapi: {
    backend?: 'nano-banana' | 'grok';
    grokTier?: 'lite' | 'standard' | 'pro';
  };
  /** Apimart — currently only serves gpt-image-2; no per-request options yet. */
  apimart: Record<string, never>;
  /** Google AI Studio. */
  google: Record<string, never>;
  /** Vertex AI. */
  vertex: Record<string, never>;
}

// ============================================================================
// Binding — discriminated union by provider kind
// ============================================================================

/**
 * Binding is keyed by `provider`. For each provider kind, `providerOptions` is
 * typed strictly to that provider's slot in ProviderOptionsMap.
 *
 * Channel-router runtime overrides may replace `provider` + `apiModelId` at
 * call time; they do NOT touch ProductModel.id / ExecutableModel.id.
 */
export type Binding = {
  [P in ProviderKind]: {
    provider: P;
    apiModelId: string;
    fallback?: ProviderKind[];
    providerOptions?: ProviderOptionsMap[P];
  };
}[ProviderKind];

// ============================================================================
// ExecutableModel — the concrete unit that hits a provider
// ============================================================================

export interface ImageExecutableCost {
  internalCredits: number | ResolutionPricing;
}

interface ExecutableBase {
  /** Internal canonical id (kebab-case, permanent, unique). Written to DB.internal_model_id. */
  id: string;
  family: ModelFamily;
  /**
   * Structured version. Used by channel router to build family:version routing keys.
   * Not parsed from modelId via regex.
   */
  version: string;
  binding: Binding;
  /**
   * NSFW-safety runtime gate. When true, the NSFW detection step skips this
   * executable. Per-executable, NOT per-product.
   */
  supportsNsfw?: boolean;
  /**
   * True when this executable is reachable only as an internal fallback target,
   * never via a normal user-facing product slug.
   */
  isInternalOnly?: boolean;
  estimatedGenerationTime?: number;
}

export interface ImageExecutableModel extends ExecutableBase {
  /**
   * Image executables are typically multi-modal: the same provider endpoint
   * serves both T2I and I2I, with the provider inferring mode from input-image
   * presence. Pure-edit-only or pure-T2I-only executables still express a
   * single-element array — always an array to avoid conditional handling at
   * call sites.
   */
  modality: ImageModality[];
  capabilities: Capabilities;
  cost: ImageExecutableCost;
}

export type ExecutableModel = ImageExecutableModel;

// ============================================================================
// Resolver — ProductModel → ExecutableModel routing
// ============================================================================

/**
 * Runtime context a request brings, used by ProductModel.resolver to pick an
 * ExecutableModel. Any field left undefined means "do not constrain on this
 * dimension". All declared fields on a rule must match for the rule to fire.
 */
export interface ResolverContext {
  hasInputImage?: boolean;
  /** True when upstream NSFW detection has flagged the request. */
  nsfw?: boolean;
  /** Optional ui/client-declared mode hint. */
  mode?: string;
}

export interface ResolverRule {
  when: ResolverContext;
  /** ExecutableModel.id to route to when `when` matches. */
  executableId: string;
}

export interface Resolver {
  /**
   * Rules must be written "specific → general". First match wins.
   * Startup validation checks for ordering subsumption conflicts.
   */
  rules: ResolverRule[];
  /** Used when no rule matches. Also counted in all capability/pricing validations. */
  fallbackExecutableId: string;
}

// ============================================================================
// ProductModel — user-facing identity
// ============================================================================

export interface ProductPolicy {
  /** When true, only paid users may submit. Free users get PRO_REQUIRED. */
  paidOnly?: boolean;
  /**
   * When true, the product cannot be submitted by an unauthenticated user
   * regardless of which surface they came in through. This is the model's
   * own physical constraint (e.g. heavy/expensive video models that can't
   * be exposed to anonymous traffic) and is enforced *in addition* to the
   * surface-level allow-list — defense in depth: if a surface config
   * forgets to exclude a heavy model, this still rejects.
   */
  requiresAuth?: boolean;
}

export interface ImageProductPricing {
  /** External credits shown/charged to the user. */
  externalCredits: number | ResolutionPricing;
}

/**
 * Visibility controls how a ProductModel surfaces to the outside world.
 */
export type ProductVisibility = 'public' | 'internal' | 'deprecated';

/** UI-facing badge shown next to a product in the picker. */
export type ProductBadge =
  | { kind: 'new' }
  | { kind: 'sale'; label: string }
  | { kind: 'pro' };

/**
 * Picker / marketing presentation. Optional metadata used by selectors.
 */
export interface ProductPresentation {
  description?: string;
  order?: number;
  generationTimeLabel?: string;
  creditsLabel?: string;
  badges?: ProductBadge[];
  noMarketingPage?: boolean;
  logo?: string;
  icon?: string;
}

interface ProductBase {
  /** URL slug (reserved for future /image/[model] pages — gptimage2 doesn't use this today). */
  slug: string;
  /** External product id written to DB.external_model_id. Usually equals slug. */
  id: string;
  /** Historical slugs preserved for bookmark compatibility. */
  legacySlugs?: string[];
  /** User-facing display name — the single source of truth for branding. */
  displayName: string;

  family: ModelFamily;
  visibility: ProductVisibility;

  resolver: Resolver;

  policy: ProductPolicy;

  /** Optional picker / marketing presentation. */
  picker?: ProductPresentation;
}

export interface ImageProductModel extends ProductBase {
  /**
   * Coarse-grained modalities this product can serve. Must be a superset of
   * `modality` across all reachable target ExecutableModels (startup validation
   * enforces this).
   */
  supportedModalities: ImageModality[];
  /**
   * User-visible capabilities. Must be a subset (or equal) of the capabilities
   * of EVERY reachable ExecutableModel target — including `fallbackExecutableId`.
   */
  declaredCapabilities: Capabilities;
  pricing: ImageProductPricing;
}

export type ProductModel = ImageProductModel;

// ============================================================================
// Registry query result types
// ============================================================================

/**
 * Output of Registry.resolve(): what the caller needs to both run the request
 * and write the correct DB rows.
 */
export interface ResolveResult {
  product: ProductModel;
  executable: ExecutableModel;
  /** Same as product.id — written to DB.external_model_id, returned to client. */
  externalModelId: string;
  /** Same as executable.id — written to DB.internal_model_id, used by providers. */
  internalModelId: string;
}
