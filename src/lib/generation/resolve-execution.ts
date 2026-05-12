import { websiteConfig } from '@/config/website';
import { detectChinaUser } from '@/lib/geo';
import { IMAGE_PRODUCTS } from '@/models/image-models';
import { getExecutableById } from '@/models/registry';
import { VIDEO_PRODUCTS, getVideoExecutableById } from '@/models/video-models';
import type { ExecutionRule, SurfaceConfig } from '@/types';

/**
 * Request context fed into surface execution rules. Built once per
 * submit at the route boundary so the rules engine has a single,
 * uniform input shape regardless of which route is calling.
 */
export interface ExecutionContext {
  country: string | null;
  /** Primary language tag from `accept-language`, e.g. 'zh' / 'en'. */
  locale: string | null;
  promptIsChinese: boolean;
}

/**
 * Build an {@link ExecutionContext} from a request. Reuses the
 * existing `detectChinaUser` helper for IP / language / prompt
 * heuristics; pulled here so all surface routes derive the context
 * the same way.
 */
export function buildExecutionContext(input: {
  headers: Headers;
  prompt?: string | null;
}): ExecutionContext {
  const detection = detectChinaUser({
    headers: input.headers,
    prompt: input.prompt ?? null,
  });
  const lang = (input.headers.get('accept-language') ?? '')
    .toLowerCase()
    .split(/[,;]/)[0]
    ?.split('-')[0]
    ?.trim();
  return {
    country: detection.country,
    locale: lang || null,
    promptIsChinese: detection.reason === 'prompt',
  };
}

function ruleMatches(rule: ExecutionRule, ctx: ExecutionContext): boolean {
  const w = rule.when;
  if (w.country && (!ctx.country || !w.country.includes(ctx.country))) {
    return false;
  }
  if (w.locale && (!ctx.locale || !w.locale.includes(ctx.locale))) {
    return false;
  }
  if (
    typeof w.promptIsChinese === 'boolean' &&
    w.promptIsChinese !== ctx.promptIsChinese
  ) {
    return false;
  }
  return true;
}

/**
 * Outcome of resolving a surface against a request context.
 *
 * - `executableId`: the ExecutableModel to actually run, or null when
 *   no rule matched and the surface didn't define a fallback (in which
 *   case the caller defers to the ProductModel's product-level
 *   resolver).
 * - `matchedRule`: the index of the rule that fired (for telemetry /
 *   debugging), or null for fallback / product-level paths.
 * - `decision`: snapshot of the inputs and outcome, written to
 *   `executionMetadata` for audit. Never returned to clients.
 */
export interface ExecutionDecision {
  executableId: string | null;
  matchedRule: number | null;
  decision: {
    country: string | null;
    locale: string | null;
    promptIsChinese: boolean;
    matchedRule: number | null;
    executableId: string | null;
  };
}

/**
 * Resolve a SurfaceConfig + request context to an ExecutableModel id.
 *
 * Returns `executableId: null` when neither a rule nor
 * `executionFallbackId` applies — the caller should fall back to the
 * ProductModel's own `resolver.fallbackExecutableId`.
 */
/**
 * Boot-time validation of every surface's references. Runs once when this
 * module is first imported. Throws if any surface points at a non-existent
 * ProductModel id (allowedModels / defaultModel) or ExecutableModel id
 * (executionRules / executionFallbackId) — typos in `website.tsx` fail
 * the process at startup instead of producing 500s on the first matching
 * request.
 */
function validateSurfacesAtBoot(): void {
  const imageProductIds = new Set(IMAGE_PRODUCTS.map((p) => p.id));
  const videoProductIds = new Set(VIDEO_PRODUCTS.map((p) => p.id));
  const errs: string[] = [];

  // Validate image surfaces against the IMAGE_PRODUCTS registry +
  // ExecutableModel map (executionRules supported).
  for (const [name, surface] of Object.entries(
    websiteConfig.generation.surfaces
  )) {
    for (const id of surface.allowedModels) {
      if (!imageProductIds.has(id)) {
        errs.push(
          `[generation.surfaces.${name}.allowedModels] references unknown ProductModel id "${id}"`
        );
      }
    }
    if (!surface.allowedModels.includes(surface.defaultModel)) {
      errs.push(
        `[generation.surfaces.${name}.defaultModel] "${surface.defaultModel}" is not in allowedModels`
      );
    }
    for (const rule of surface.executionRules ?? []) {
      if (!getExecutableById(rule.executableId)) {
        errs.push(
          `[generation.surfaces.${name}.executionRules] references unknown ExecutableModel id "${rule.executableId}"`
        );
      }
    }
    if (
      surface.executionFallbackId &&
      !getExecutableById(surface.executionFallbackId)
    ) {
      errs.push(
        `[generation.surfaces.${name}.executionFallbackId] references unknown ExecutableModel id "${surface.executionFallbackId}"`
      );
    }
  }

  // Validate video surfaces against the new VIDEO_PRODUCTS /
  // VIDEO_EXECUTABLES registry. executionRules are now supported
  // (referenced ids must point at VideoExecutableModel entries).
  for (const [name, surface] of Object.entries(
    websiteConfig.generation.videoSurfaces
  )) {
    for (const id of surface.allowedModels) {
      if (!videoProductIds.has(id)) {
        errs.push(
          `[generation.videoSurfaces.${name}.allowedModels] references unknown VideoProductModel id "${id}"`
        );
      }
    }
    if (!surface.allowedModels.includes(surface.defaultModel)) {
      errs.push(
        `[generation.videoSurfaces.${name}.defaultModel] "${surface.defaultModel}" is not in allowedModels`
      );
    }
    for (const rule of surface.executionRules ?? []) {
      if (!getVideoExecutableById(rule.executableId)) {
        errs.push(
          `[generation.videoSurfaces.${name}.executionRules] references unknown VideoExecutableModel id "${rule.executableId}"`
        );
      }
    }
    if (
      surface.executionFallbackId &&
      !getVideoExecutableById(surface.executionFallbackId)
    ) {
      errs.push(
        `[generation.videoSurfaces.${name}.executionFallbackId] references unknown VideoExecutableModel id "${surface.executionFallbackId}"`
      );
    }
  }

  if (errs.length > 0) {
    const msg = `Invalid generation surfaces config:\n  - ${errs.join('\n  - ')}`;
    // Throw at import time so misconfigurations crash the build / boot
    // rather than silently misroute traffic.
    throw new Error(msg);
  }
}

validateSurfacesAtBoot();

export function resolveExecutionForSurface(
  surface: SurfaceConfig,
  ctx: ExecutionContext
): ExecutionDecision {
  const rules = surface.executionRules ?? [];
  for (let i = 0; i < rules.length; i++) {
    if (ruleMatches(rules[i], ctx)) {
      return {
        executableId: rules[i].executableId,
        matchedRule: i,
        decision: {
          country: ctx.country,
          locale: ctx.locale,
          promptIsChinese: ctx.promptIsChinese,
          matchedRule: i,
          executableId: rules[i].executableId,
        },
      };
    }
  }
  const fallback = surface.executionFallbackId ?? null;
  return {
    executableId: fallback,
    matchedRule: null,
    decision: {
      country: ctx.country,
      locale: ctx.locale,
      promptIsChinese: ctx.promptIsChinese,
      matchedRule: null,
      executableId: fallback,
    },
  };
}
