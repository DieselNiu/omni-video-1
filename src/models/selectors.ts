/**
 * Model Registry — selectors (public-facing queries / derivations).
 *
 * Thin helpers built on top of the registry for call sites that would otherwise
 * re-implement the same lookup or transformation. Phase 1 ships the minimum
 * surface; Phase 2 read-path cutover will add picker/option derivations here
 * as call sites migrate off legacy IMAGE_MODELS.
 */

import {
  MODEL_REGISTRY,
  getProductById,
  getProductBySlug,
  listProducts,
} from './registry';
import type {
  ImageModality,
  ImageProductModel,
  ProductModel,
  ProductVisibility,
} from './types';

// ----------------------------------------------------------------------------
// Public listing helpers
// ----------------------------------------------------------------------------

/**
 * All public image products (visibility='public'), in registry insertion order.
 * Used by frontend picker once Phase 2 cuts over getImageModelOptionsByMode.
 */
export function listPublicProducts(): ImageProductModel[] {
  return listProducts({ visibility: 'public' }) as ImageProductModel[];
}

/**
 * Products filtered to a specific modality. A product "serves" a modality iff
 * its `supportedModalities` includes it — e.g. gpt-image-2 / nano-banana-pro
 * serve both t2i and i2i, nano-banana serves only t2i.
 */
export function listProductsByModality(
  modality: ImageModality,
  visibility: ProductVisibility | ProductVisibility[] = 'public'
): ImageProductModel[] {
  return listProducts({ modality, visibility }) as ImageProductModel[];
}

// ----------------------------------------------------------------------------
// Existence / lookup helpers
// ----------------------------------------------------------------------------

/**
 * True iff `id` is a known product id in the registry. Used by route-level
 * validation to replace `modelId in IMAGE_MODELS` checks.
 */
export function isValidProductId(id: string): boolean {
  return getProductById(id) !== undefined;
}

/**
 * Resolve slug → product id (handles legacySlugs). Returns undefined if
 * slug is unknown.
 */
export function productIdFromSlug(slug: string): string | undefined {
  return getProductBySlug(slug)?.id;
}

// ----------------------------------------------------------------------------
// Convenience re-exports
// ----------------------------------------------------------------------------

export { MODEL_REGISTRY };
export type { ProductModel, ImageProductModel };
