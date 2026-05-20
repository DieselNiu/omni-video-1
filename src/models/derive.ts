/**
 * Legacy-shape derivation — pure functions that reconstruct the legacy
 * src/image/config/image-models.ts IMAGE_MODELS record from the registry.
 *
 * Purpose: byte-for-byte equivalence proof during Phase 1/2. Consumers that
 * still read `IMAGE_MODELS` continue to work while the registry becomes the
 * single source of truth. Deleted in Phase 4 once every read site migrates.
 *
 * Do NOT add new features here — if a field isn't in the legacy shape, put
 * it on ProductModel / ExecutableModel and read it from the registry directly.
 */

import type { ImageExecutableModel, ImageProductModel } from './types';

// ----------------------------------------------------------------------------
// Legacy-shape types (mirror src/image/config/image-models.ts exports).
// Duplicated here to keep derive.ts self-contained and avoid a circular
// dependency with the legacy module.
// ----------------------------------------------------------------------------

type LegacyProviderEnum = 'kie';
type LegacyType = 'text-to-image' | 'image-to-image';
type LegacyStatus = 'active' | 'inactive';

export interface LegacyImageModelConfig {
  id: string;
  name: string;
  displayName: string;
  provider: LegacyProviderEnum;
  type: LegacyType;
  status: LegacyStatus;
  features: string[];
  credits: number;
  maxInputImages?: number;
  supportedAspectRatios: string[];
  supportedResolutions?: string[];
  supportedFormats: string[];
  estimatedGenerationTime?: number;
  isProApi?: boolean;
}

// ----------------------------------------------------------------------------
// Per-id legacy-only metadata.
//
// `features` and `isProApi` are legacy-arbitrary fields that don't map cleanly
// onto the registry model. They stay here for the duration of Phase 1–3 and
// get deleted with derive.ts in Phase 4.
// ----------------------------------------------------------------------------

const LEGACY_METADATA: Record<
  string,
  { features: string[]; isProApi: boolean }
> = {
  'nano-banana-pro': {
    features: [
      'text-to-image',
      'image-to-image',
      'high-quality',
      '4k-resolution',
    ],
    isProApi: true,
  },
  'nano-banana': {
    features: ['text-to-image', 'high-quality'],
    isProApi: false,
  },
  'nano-banana-2': {
    features: [
      'text-to-image',
      'image-to-image',
      'high-quality',
      '4k-resolution',
    ],
    isProApi: true,
  },
  // Apimart's gpt-image-2 supports resolution=1k/2k/4k natively — isProApi
  // flips on the dashboard resolution picker.
  'gpt-image-2': {
    features: [
      'text-to-image',
      'image-to-image',
      'high-quality',
      '4k-resolution',
    ],
    isProApi: true,
  },
};

// ----------------------------------------------------------------------------
// Field derivers
// ----------------------------------------------------------------------------

/**
 * Legacy `type` was a single value: products with both t2i and i2i were
 * labeled TEXT_TO_IMAGE (per legacy IMAGE_MODELS['nano-banana-pro']); pure
 * i2i products were IMAGE_TO_IMAGE.
 */
function deriveType(product: ImageProductModel): LegacyType {
  if (product.supportedModalities.includes('t2i')) return 'text-to-image';
  return 'image-to-image';
}

/**
 * Legacy `credits` was always a scalar. Registry products with ResolutionPricing
 * don't map to a single scalar, so we fall back to the minimum tier — but
 * gptimage2's legacy models all use flat pricing so this branch never fires
 * in practice during Phase 1.
 */
function deriveCredits(product: ImageProductModel): number {
  const p = product.pricing.externalCredits;
  if (typeof p === 'number') return p;
  const values = Object.values(p).filter(
    (v): v is number => typeof v === 'number'
  );
  if (values.length === 0) return 0;
  return Math.min(...values);
}

/**
 * Pick the primary executable for a product — used for fields like
 * `estimatedGenerationTime` that live on the executable side.
 */
function primaryExecutable(
  product: ImageProductModel,
  executables: readonly ImageExecutableModel[]
): ImageExecutableModel | undefined {
  return executables.find(
    (e) => e.id === product.resolver.fallbackExecutableId
  );
}

// ----------------------------------------------------------------------------
// Main entry point
// ----------------------------------------------------------------------------

/**
 * Reconstruct the legacy IMAGE_MODELS record from the registry arrays.
 * Only public products with legacy metadata entries appear in the output;
 * new products (e.g. `gpt-image-2`) added in Phase 1 are omitted to preserve
 * byte-for-byte equivalence with the pre-refactor shape.
 */
export function deriveImageModels(
  products: readonly ImageProductModel[],
  executables: readonly ImageExecutableModel[]
): Record<string, LegacyImageModelConfig> {
  const out: Record<string, LegacyImageModelConfig> = {};

  for (const product of products) {
    const legacy = LEGACY_METADATA[product.id];
    if (!legacy) continue; // new products (post-refactor) excluded

    const exec = primaryExecutable(product, executables);
    const caps = product.declaredCapabilities.image;

    const entry: LegacyImageModelConfig = {
      id: product.id,
      name: product.id,
      displayName: product.displayName,
      // Legacy hardcoded every entry to ImageModelProvider.KIE regardless of
      // actual provider routing. Preserve that.
      provider: 'kie',
      type: deriveType(product),
      status: product.visibility === 'deprecated' ? 'inactive' : 'active',
      features: legacy.features,
      credits: deriveCredits(product),
      supportedAspectRatios: [...caps.supportedAspectRatios],
      supportedFormats: [...caps.supportedFormats],
      estimatedGenerationTime: exec?.estimatedGenerationTime,
      isProApi: legacy.isProApi,
    };

    if (caps.maxInputImages !== undefined) {
      entry.maxInputImages = caps.maxInputImages;
    }
    if (caps.supportedResolutions) {
      entry.supportedResolutions = [...caps.supportedResolutions];
    }

    out[product.id] = entry;
  }

  return out;
}
