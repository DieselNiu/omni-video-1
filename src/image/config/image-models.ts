/**
 * Image Model Configuration
 *
 * Phase 2 note: `IMAGE_MODELS` is now derived from the registry at
 * `@/models/registry` (see docs/model-registry-migration.md). The shape is
 * reproduced byte-for-byte via `deriveImageModels()` so every existing reader
 * (`getImageModel`, `calculateImageCredits`, `getImageModelOptionsByMode`, …)
 * keeps working unchanged. Phase 4 removes this module entirely once all
 * callers migrate to reading the registry directly.
 */

import { websiteConfig } from '@/config/website';
import {
  type LegacyImageModelConfig,
  deriveImageModels,
} from '@/models/derive';
import { IMAGE_EXECUTABLES, IMAGE_PRODUCTS } from '@/models/image-models';
import { getProductById } from '@/models/registry';
import type { ImageProductModel, Resolution } from '@/models/types';

export enum ImageModelType {
  TEXT_TO_IMAGE = 'text-to-image',
  IMAGE_TO_IMAGE = 'image-to-image',
}

export enum ImageModelProvider {
  KIE = 'kie',
}

/**
 * Available extra marketing section types
 * Add new section types here when creating new marketing components
 */
export type ExtraMarketingSectionType =
  | 'comparison'
  | 'gallery'
  | 'tutorial'
  | 'pricing-detail'
  | 'twitter-wall';

export interface ImageModelConfig {
  id: string;
  name: string;
  displayName: string;
  provider: ImageModelProvider;
  type: ImageModelType;
  status: 'active' | 'inactive';
  features: string[];
  credits: number;
  maxInputImages?: number;
  supportedAspectRatios: string[];
  supportedResolutions?: string[];
  supportedFormats: string[];
  estimatedGenerationTime?: number;
  isProApi?: boolean; // Uses Pro API endpoint
  /**
   * Extra marketing sections to render for this model
   * These are rendered after ModelUseCasesSection and before ModelTestimonialsSection
   */
  extraMarketingSections?: ExtraMarketingSectionType[];
}

/**
 * Registry-derived IMAGE_MODELS. Phase 1 equivalence tests
 * (`pnpm test:registry`) prove this is byte-for-byte identical to the
 * pre-refactor static constant. Cached once at module load since derivation
 * is deterministic and the registry is immutable.
 *
 * The `as` cast converts the legacy-string-shaped derive output into the
 * enum-typed `ImageModelConfig` shape — both sides agree at runtime
 * (`ImageModelProvider.KIE === 'kie'`, `ImageModelType.TEXT_TO_IMAGE ===
 * 'text-to-image'`). Cast removed with this file in Phase 4.
 */
const DERIVED_IMAGE_MODELS: Record<string, LegacyImageModelConfig> =
  deriveImageModels(IMAGE_PRODUCTS, IMAGE_EXECUTABLES);

export const IMAGE_MODELS: Record<string, ImageModelConfig> =
  DERIVED_IMAGE_MODELS as unknown as Record<string, ImageModelConfig>;

export function getImageModel(modelId: string): ImageModelConfig | undefined {
  return IMAGE_MODELS[modelId];
}

export function calculateImageCredits(
  modelId: string,
  resolution?: string
): number {
  const product = getProductById(modelId);
  if (!product) return 0;

  const price = product.pricing.externalCredits;
  if (typeof price === 'number') return price;

  // Tiered pricing: prefer the requested resolution tier; fall back to the
  // first declared tier so unknown / undeclared resolutions still charge
  // something deterministic (Phase 2 has no tiered products in production,
  // but the registered gpt-image-2 remains flat; kept for future tiering).
  if (resolution) {
    const tier = price[resolution as Resolution];
    if (tier !== undefined) return tier;
  }
  const firstTier = Object.values(price).find(
    (v): v is number => typeof v === 'number'
  );
  return firstTier ?? 0;
}

export function isKieModel(modelId: string): boolean {
  const model = getImageModel(modelId);
  return model?.provider === ImageModelProvider.KIE;
}

// ============================================
// Frontend UI Helper Types and Functions
// ============================================

export interface ImageModelOption {
  value: string;
  label: string;
  icon: string;
  logo?: string; // Optional SVG logo path (e.g., /icons/models/banana.svg)
  credits: number;
}

export interface AspectRatioOption {
  value: string;
  label: string;
}

export interface ResolutionOption {
  value: string;
  label: string;
}

/**
 * Get model options for Select component
 * Only returns active models
 */
export function getImageModelOptions(): ImageModelOption[] {
  return Object.values(IMAGE_MODELS)
    .filter((model) => model.status === 'active')
    .map((model) => ({
      value: model.id,
      label: model.displayName,
      icon: '',
      logo: '/svg/openai-mark.svg',
      credits: model.credits,
    }));
}

/**
 * Get aspect ratio options for Select component
 */
export function getAspectRatioOptions(): AspectRatioOption[] {
  return [
    { value: '1:1', label: '1:1' },
    { value: '16:9', label: '16:9' },
    { value: '9:16', label: '9:16' },
    { value: '4:3', label: '4:3' },
    { value: '3:4', label: '3:4' },
  ];
}

/**
 * Get resolution options for Pro model
 */
export function getResolutionOptions(): ResolutionOption[] {
  return [
    { value: '1K', label: '1K' },
    { value: '2K', label: '2K' },
    { value: '4K', label: '4K' },
  ];
}

/**
 * Check if model is Pro model (supports resolution selection)
 */
export function isProModel(modelId: string): boolean {
  const model = getImageModel(modelId);
  return model?.isProApi === true;
}

/**
 * Get display label for an image model
 */
export function getImageModelLabel(modelId: string): string | undefined {
  const model = getImageModel(modelId);
  return model?.displayName;
}

/**
 * Check if a model ID is a valid image model
 */
export function isValidImageModel(modelId: string): boolean {
  return modelId in IMAGE_MODELS && IMAGE_MODELS[modelId].status === 'active';
}

/**
 * Default image model for the workspace. Pulled from the user-paid
 * surface so changing the dashboard default is a one-line config edit
 * in `website.tsx`.
 */
export const DEFAULT_IMAGE_MODEL =
  websiteConfig.generation.surfaces['user-paid'].defaultModel;

/**
 * Get model options for the dashboard's image picker.
 *
 * Source of truth: `surfaces['user-paid'].allowedModels` in
 * `website.tsx`. Each id is materialized into a picker option using
 * the registry's ProductModel for display name and pricing — so
 * adding a new option to the dashboard is a one-line config edit
 * (allowed-list) plus the existing ProductModel registration.
 *
 * Mode filtering: legacy contract was per-mode. We honour it by
 * inspecting the ProductModel's `supportedModalities`; products that
 * don't serve the requested modality are filtered out so the
 * resulting list never offers an option that would 4xx on submit.
 */
export function getImageModelOptionsByMode(
  mode: 'text-to-image' | 'image-to-image'
): ImageModelOption[] {
  const allowed = websiteConfig.generation.surfaces['user-paid'].allowedModels;
  const wantModality: 't2i' | 'i2i' = mode === 'image-to-image' ? 'i2i' : 't2i';

  const options: ImageModelOption[] = [];
  for (const id of allowed) {
    const product = IMAGE_PRODUCTS.find((p: ImageProductModel) => p.id === id);
    if (!product) continue;
    if (!product.supportedModalities.includes(wantModality)) continue;

    // Pricing: external credits are either flat (`number`) or per
    // resolution; for the dashboard option label we surface the flat
    // case as a number and otherwise show the lowest tier.
    const externalCredits = product.pricing.externalCredits;
    const credits =
      typeof externalCredits === 'number'
        ? externalCredits
        : Math.min(
            ...Object.values(externalCredits).filter(
              (v): v is number => typeof v === 'number'
            )
          );

    // Nano Banana family → 🍌 emoji as inline icon (no logo asset).
    // Everyone else falls back to the OpenAI mark for now.
    const isNanoBanana = product.family === 'nano-banana';
    options.push({
      value: product.id,
      label: product.displayName,
      icon: isNanoBanana ? '🍌' : '',
      logo: isNanoBanana ? undefined : '/svg/openai-mark.svg',
      credits,
    });
  }
  return options;
}

// Legacy single-option helper retained for the home page hero, which
// only ever shows one model regardless of mode. Reads the
// home-anonymous default so the homepage label stays config-driven.
export function getHomeImageModelOption(): ImageModelOption {
  const homeId =
    websiteConfig.generation.surfaces['home-anonymous'].defaultModel;
  const product = IMAGE_PRODUCTS.find((p) => p.id === homeId);
  return {
    value: homeId,
    label: product?.displayName ?? homeId,
    icon: '',
    logo: '/svg/openai-mark.svg',
    credits:
      typeof product?.pricing.externalCredits === 'number'
        ? product.pricing.externalCredits
        : 3,
  };
}
