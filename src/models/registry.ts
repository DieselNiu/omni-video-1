/**
 * Model Registry — skeleton + query API + startup validation (image-only).
 *
 * Ported from sister project image-website/src/models/registry.ts. Trimmed to
 * image-only since gptimage2 has no video pipeline.
 *
 * Invariants enforced at startup (fail-fast):
 *   1. id/slug uniqueness across products and executables
 *   2. every resolver target (rules + fallback) must exist
 *   3. ProductModel.declaredCapabilities is a subset of every reachable target's
 *      capabilities (supportedAspectRatios ⊆, supportedResolutions ⊆,
 *      supportedFormats ⊆, maxInputImages ≤)
 *   4. ProductModel.pricing.externalCredits ≥ ExecutableModel.cost.internalCredits
 *      at every resolution tier both sides declare
 *
 * All validators are pure + individually exported so tests can feed bad fixtures.
 */

import type {
  Binding,
  ExecutableModel,
  ImageExecutableModel,
  ImageProductModel,
  ModelFamily,
  ModelModality,
  ProductModel,
  ProductVisibility,
  ProviderKind,
  ResolutionPricing,
  ResolveResult,
  ResolverContext,
  ResolverRule,
} from './types';

// ============================================================================
// Registry shape
// ============================================================================

export interface RegistryInput {
  products: ProductModel[];
  executables: ExecutableModel[];
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export interface ProductFilter {
  family?: ModelFamily;
  modality?: ModelModality;
  visibility?: ProductVisibility | ProductVisibility[];
}

export interface ExecutableFilter {
  family?: ModelFamily;
  modality?: ModelModality;
}

export interface ModelRegistry {
  readonly products: readonly ProductModel[];
  readonly executables: readonly ExecutableModel[];

  getProductBySlug(slug: string): ProductModel | undefined;
  getProductById(id: string): ProductModel | undefined;
  getExecutableById(id: string): ExecutableModel | undefined;
  listProducts(filter?: ProductFilter): ProductModel[];
  listExecutables(filter?: ExecutableFilter): ExecutableModel[];
  resolve(slug: string, ctx?: ResolverContext): ResolveResult;

  /** Re-validates the registry. Called once at construction; exposed for tests. */
  validate(): ValidationResult;
}

// ============================================================================
// Registry factory
// ============================================================================

/**
 * Back-compat for ExecutableModel.id renames. Pre-rename DB rows have
 * `internal_model_id` values without the `-<vendor>` suffix; this map
 * lets `getExecutableById` resolve those legacy ids to their renamed
 * counterparts so historical assets keep working without a DB migration.
 *
 * Add an entry here whenever an ExecutableModel.id is renamed; never
 * delete entries — old rows live forever.
 *
 * See `src/models/image-models.ts` top-of-file naming convention.
 */
const LEGACY_EXECUTABLE_ID_ALIASES: Readonly<Record<string, string>> = {
  'nano-banana-pro': 'nano-banana-pro-maxapi',
  'nano-banana': 'nano-banana-maxapi',
};

export function createRegistry(input: RegistryInput): ModelRegistry {
  const products = [...input.products];
  const executables = [...input.executables];

  const productBySlug = new Map<string, ProductModel>();
  const productById = new Map<string, ProductModel>();
  const executableById = new Map<string, ExecutableModel>();

  for (const e of executables) executableById.set(e.id, e);
  for (const p of products) {
    productById.set(p.id, p);
    productBySlug.set(p.slug, p);
    for (const legacy of p.legacySlugs ?? []) productBySlug.set(legacy, p);
  }

  // Resolve through legacy alias map: callers reading
  // `internal_model_id` from old DB rows will look up by the legacy id;
  // we transparently redirect them to the renamed executable.
  const lookupExecutable = (id: string): ExecutableModel | undefined => {
    const direct = executableById.get(id);
    if (direct) return direct;
    const aliased = LEGACY_EXECUTABLE_ID_ALIASES[id];
    if (aliased) return executableById.get(aliased);
    return undefined;
  };

  const registry: ModelRegistry = {
    products,
    executables,

    getProductBySlug: (slug) => productBySlug.get(slug),
    getProductById: (id) => productById.get(id),
    getExecutableById: (id) => lookupExecutable(id),

    listProducts: (filter) => {
      if (!filter) return [...products];
      return products.filter((p) => matchesProductFilter(p, filter));
    },

    listExecutables: (filter) => {
      if (!filter) return [...executables];
      return executables.filter((e) => matchesExecutableFilter(e, filter));
    },

    resolve: (slug, ctx = {}) => {
      const product = productBySlug.get(slug);
      if (!product) {
        throw new Error(`[registry] Unknown product slug: ${slug}`);
      }
      const rule = product.resolver.rules.find((r) => matchesRule(r, ctx));
      const executableId =
        rule?.executableId ?? product.resolver.fallbackExecutableId;
      const executable = executableById.get(executableId);
      if (!executable) {
        throw new Error(
          `[registry] integrity error: product "${product.id}" resolver routed to non-existent executable "${executableId}"`
        );
      }
      return {
        product,
        executable,
        externalModelId: product.id,
        internalModelId: executable.id,
      };
    },

    validate: () => validateRegistry({ products, executables }),
  };

  // Startup validation: fail fast.
  const result = registry.validate();
  if (result.errors.length > 0) {
    const summary = [
      '[registry] validation failed — fix before shipping:',
      ...result.errors.map((e) => `  ✗ ${e}`),
    ].join('\n');
    throw new Error(summary);
  }
  if (result.warnings.length > 0 && process.env.NODE_ENV !== 'production') {
    for (const w of result.warnings) {
      console.warn(`[registry] ${w}`);
    }
  }

  return registry;
}

// ============================================================================
// Filter helpers
// ============================================================================

function matchesProductFilter(p: ProductModel, f: ProductFilter): boolean {
  if (f.family && p.family !== f.family) return false;
  if (f.modality && !p.supportedModalities.includes(f.modality)) return false;
  if (f.visibility) {
    const wanted = Array.isArray(f.visibility) ? f.visibility : [f.visibility];
    if (!wanted.includes(p.visibility)) return false;
  }
  return true;
}

function matchesExecutableFilter(
  e: ExecutableModel,
  f: ExecutableFilter
): boolean {
  if (f.family && e.family !== f.family) return false;
  if (f.modality && !e.modality.includes(f.modality)) return false;
  return true;
}

// ============================================================================
// Rule matching
// ============================================================================

/**
 * A rule matches a context iff every field declared in rule.when matches the
 * same field in ctx. Undeclared fields impose no constraint.
 */
export function matchesRule(rule: ResolverRule, ctx: ResolverContext): boolean {
  const w = rule.when;
  if (w.hasInputImage !== undefined && w.hasInputImage !== ctx.hasInputImage)
    return false;
  if (w.nsfw !== undefined && w.nsfw !== ctx.nsfw) return false;
  if (w.mode !== undefined && w.mode !== ctx.mode) return false;
  return true;
}

// ============================================================================
// Validation: top-level
// ============================================================================

export function validateRegistry(input: RegistryInput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  errors.push(...validateNoDuplicateIds(input));
  errors.push(...validateResolverTargetsExist(input));
  errors.push(...validateCapabilitiesSubset(input));
  errors.push(...validatePricingCoversCost(input));
  errors.push(...validateResolverRuleOrdering(input));

  return { errors, warnings };
}

// ============================================================================
// Validators — exported for tests
// ============================================================================

export function validateNoDuplicateIds(input: RegistryInput): string[] {
  const errs: string[] = [];
  const seenProdIds = new Set<string>();
  const seenProdSlugs = new Set<string>();
  const seenExecIds = new Set<string>();

  for (const p of input.products) {
    if (seenProdIds.has(p.id)) errs.push(`duplicate ProductModel id "${p.id}"`);
    seenProdIds.add(p.id);

    if (seenProdSlugs.has(p.slug))
      errs.push(`duplicate ProductModel slug "${p.slug}"`);
    seenProdSlugs.add(p.slug);

    for (const legacy of p.legacySlugs ?? []) {
      if (seenProdSlugs.has(legacy))
        errs.push(
          `legacySlug "${legacy}" on product "${p.id}" collides with an existing slug`
        );
      seenProdSlugs.add(legacy);
    }
  }

  for (const e of input.executables) {
    if (seenExecIds.has(e.id))
      errs.push(`duplicate ExecutableModel id "${e.id}"`);
    seenExecIds.add(e.id);
  }

  return errs;
}

export function validateResolverTargetsExist(input: RegistryInput): string[] {
  const errs: string[] = [];
  const execIds = new Set(input.executables.map((e) => e.id));

  for (const p of input.products) {
    const allTargets = collectTargetIds(p);
    for (const tid of allTargets) {
      if (!execIds.has(tid)) {
        errs.push(
          `product "${p.id}" resolver references missing executable "${tid}"`
        );
      }
    }
  }
  return errs;
}

export function validateCapabilitiesSubset(input: RegistryInput): string[] {
  const errs: string[] = [];
  const execById = new Map(input.executables.map((e) => [e.id, e]));

  for (const p of input.products) {
    const toValidate = new Set<string>();
    toValidate.add(p.resolver.fallbackExecutableId);
    for (const rule of p.resolver.rules) {
      toValidate.add(rule.executableId);
    }

    for (const execId of toValidate) {
      const e = execById.get(execId);
      if (!e) continue; // reported by resolverTargetsExist
      const capErrs = checkCapabilitiesSubset(p, e);
      for (const msg of capErrs) {
        errs.push(`product "${p.id}" vs executable "${e.id}": ${msg}`);
      }
    }
  }
  return errs;
}

export function validatePricingCoversCost(input: RegistryInput): string[] {
  const errs: string[] = [];
  const execById = new Map(input.executables.map((e) => [e.id, e]));

  for (const p of input.products) {
    const tierErrs = checkPriceTierCompleteness(p);
    for (const msg of tierErrs) {
      errs.push(`product "${p.id}": ${msg}`);
    }

    const toValidate = new Set<string>();
    toValidate.add(p.resolver.fallbackExecutableId);
    for (const rule of p.resolver.rules) {
      toValidate.add(rule.executableId);
    }

    for (const execId of toValidate) {
      const e = execById.get(execId);
      if (!e) continue;
      const priceErrs = checkPriceCoversCost(p, e);
      for (const msg of priceErrs) {
        errs.push(`product "${p.id}" vs executable "${e.id}": ${msg}`);
      }
    }
  }
  return errs;
}

/**
 * When externalCredits is a ResolutionPricing and the product has declared
 * supportedResolutions, every declared resolution must have a non-undefined
 * price.
 */
function checkPriceTierCompleteness(p: ProductModel): string[] {
  const errs: string[] = [];
  const price = p.pricing.externalCredits;
  if (typeof price === 'number') return errs;

  const required = p.declaredCapabilities.image.supportedResolutions;
  if (!required || required.length === 0) return errs;

  for (const res of required) {
    if (price[res] === undefined) {
      errs.push(
        `externalCredits has no entry for declared resolution "${res}"`
      );
    }
  }
  return errs;
}

/**
 * Structural rule-ordering check. Flags cases where an earlier rule subsumes a
 * later rule — meaning the later rule is effectively dead.
 *
 * Subsumption definition: rule A subsumes rule B iff every `when` constraint
 * on A appears on B with an equal value. (No semantic implications in the
 * image-only ResolverContext — `hasInputImage`, `nsfw`, `mode` are independent.)
 */
export function validateResolverRuleOrdering(input: RegistryInput): string[] {
  const errs: string[] = [];
  for (const p of input.products) {
    const rules = p.resolver.rules;
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        if (ruleSubsumes(rules[i], rules[j])) {
          errs.push(
            `product "${p.id}" resolver rules[${i}] subsumes rules[${j}]: ` +
              `rule #${j} is dead because any context matching it also matches rule #${i} first. ` +
              'Put more specific rules first (specific → general).'
          );
        }
      }
    }
  }
  return errs;
}

// ============================================================================
// Helpers: target collection
// ============================================================================

function collectTargetIds(p: ProductModel): string[] {
  return [
    p.resolver.fallbackExecutableId,
    ...p.resolver.rules.map((r) => r.executableId),
  ];
}

// ============================================================================
// Helpers: capability subset
// ============================================================================

function checkCapabilitiesSubset(
  p: ProductModel,
  e: ExecutableModel
): string[] {
  const errs: string[] = [];

  const pc = p.declaredCapabilities.image;
  const ec = e.capabilities.image;

  if (!subset(pc.supportedAspectRatios, ec.supportedAspectRatios)) {
    errs.push(
      `declared supportedAspectRatios [${pc.supportedAspectRatios.join(',')}] not ⊆ target [${ec.supportedAspectRatios.join(',')}]`
    );
  }
  if (pc.supportedResolutions) {
    if (!ec.supportedResolutions) {
      errs.push(
        `declared supportedResolutions [${pc.supportedResolutions.join(',')}] but target executable declares none`
      );
    } else if (!subset(pc.supportedResolutions, ec.supportedResolutions)) {
      errs.push(
        `declared supportedResolutions [${pc.supportedResolutions.join(',')}] not ⊆ target [${ec.supportedResolutions.join(',')}]`
      );
    }
  }
  if (!subset(pc.supportedFormats, ec.supportedFormats)) {
    errs.push(
      `declared supportedFormats [${pc.supportedFormats.join(',')}] not ⊆ target [${ec.supportedFormats.join(',')}]`
    );
  }
  if (pc.maxInputImages !== undefined) {
    if (ec.maxInputImages === undefined) {
      errs.push(
        `declared maxInputImages=${pc.maxInputImages} but target executable declares none (cannot accept input images)`
      );
    } else if (pc.maxInputImages > ec.maxInputImages) {
      errs.push(
        `declared maxInputImages=${pc.maxInputImages} exceeds target maxInputImages=${ec.maxInputImages}`
      );
    }
  }

  return errs;
}

function subset<T>(a: readonly T[], b: readonly T[]): boolean {
  const bSet = new Set(b);
  return a.every((x) => bSet.has(x));
}

// ============================================================================
// Helpers: pricing ≥ cost
// ============================================================================

function checkPriceCoversCost(p: ProductModel, e: ExecutableModel): string[] {
  const errs: string[] = [];
  const priceCmp = cmpPricing(
    p.pricing.externalCredits,
    e.cost.internalCredits
  );
  for (const msg of priceCmp) {
    errs.push(`externalCredits < internalCredits — ${msg}`);
  }
  return errs;
}

function cmpPricing(
  price: number | ResolutionPricing,
  cost: number | ResolutionPricing
): string[] {
  const errs: string[] = [];

  if (typeof price === 'number' && typeof cost === 'number') {
    if (price < cost) errs.push(`scalar ${price} < ${cost}`);
    return errs;
  }

  const priceAt = (res: string): number | undefined =>
    typeof price === 'number' ? price : price[res as keyof ResolutionPricing];
  const costAt = (res: string): number | undefined =>
    typeof cost === 'number' ? cost : cost[res as keyof ResolutionPricing];

  const resolutions = new Set<string>([
    ...(typeof price === 'number' ? [] : Object.keys(price)),
    ...(typeof cost === 'number' ? [] : Object.keys(cost)),
  ]);

  for (const res of resolutions) {
    const pv = priceAt(res);
    const cv = costAt(res);
    if (cv === undefined) continue;
    if (pv === undefined) {
      errs.push(
        `resolution ${res}: cost=${cv} declared but product price undeclared`
      );
      continue;
    }
    if (pv < cv) errs.push(`resolution ${res}: price=${pv} < cost=${cv}`);
  }
  return errs;
}

// ============================================================================
// Helpers: rule-ordering subsumption
// ============================================================================

/**
 * Returns true iff every context that satisfies `later` also satisfies
 * `earlier`. In that case `later` is dead when placed after `earlier`.
 */
function ruleSubsumes(earlier: ResolverRule, later: ResolverRule): boolean {
  const e = earlier.when;
  const l = later.when;

  for (const key of ['hasInputImage', 'nsfw', 'mode'] as const) {
    const ev = e[key];
    if (ev === undefined) continue;
    if (l[key] !== ev) return false;
  }
  return true;
}

// ============================================================================
// Type guards
// ============================================================================

export function isImageProduct(p: ProductModel): p is ImageProductModel {
  return p.declaredCapabilities.kind === 'image';
}

export function isImageExecutable(
  e: ExecutableModel
): e is ImageExecutableModel {
  return e.capabilities.kind === 'image';
}

// ============================================================================
// Default registry instance
// ============================================================================

import { IMAGE_EXECUTABLES, IMAGE_PRODUCTS } from './image-models';

export const MODEL_REGISTRY: ModelRegistry = createRegistry({
  products: IMAGE_PRODUCTS,
  executables: IMAGE_EXECUTABLES,
});

// ============================================================================
// Module-level convenience exports
// ============================================================================

export function listProducts(filter?: ProductFilter): ProductModel[] {
  return MODEL_REGISTRY.listProducts(filter);
}

export function resolve(slug: string, ctx?: ResolverContext): ResolveResult {
  return MODEL_REGISTRY.resolve(slug, ctx);
}

export function getProductBySlug(slug: string): ProductModel | undefined {
  return MODEL_REGISTRY.getProductBySlug(slug);
}

export function getProductById(id: string): ProductModel | undefined {
  return MODEL_REGISTRY.getProductById(id);
}

export function getExecutableById(id: string): ExecutableModel | undefined {
  return MODEL_REGISTRY.getExecutableById(id);
}

/**
 * Build the runtime Binding for a provider call.
 *
 * Starts from the registry's canonical `executable.binding` (which carries
 * typed `providerOptions`) and overlays the channel-router's runtime override
 * of `provider` and optionally `apiModelId`.
 *
 * When the channel-router picks a provider different from the registry
 * default, `providerOptions` are intentionally dropped — they are typed
 * per-provider and cannot be carried across.
 */
export function buildRuntimeBinding(
  executable: ExecutableModel,
  routedChannel: string,
  routedApiModelId?: string | null
): Binding {
  const base = executable.binding;
  const provider = routedChannel as ProviderKind;
  const apiModelId = routedApiModelId ?? base.apiModelId;

  if (provider === base.provider) {
    return { ...base, apiModelId } as Binding;
  }
  return { provider, apiModelId } as Binding;
}
