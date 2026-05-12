/**
 * Image models — ProductModel / ExecutableModel instances for gptimage2.
 *
 * ============================================================================
 * Naming convention for ExecutableModel.id: `<model>-<variant?>-<vendor>`
 * ============================================================================
 *
 * - `<model>`: product family + version (e.g. `gpt-image-2`, `nano-banana`,
 *   `grok-imagine`). kebab-case. Do NOT bake vendor information here.
 * - `<variant>`: optional. Tier / mode within the model family
 *   (e.g. `lite`, `pro`, `edit`).
 * - `<vendor>`: REQUIRED. Channel key that owns the binding (`maxapi`,
 *   `apimart`, `kie`, `google`, `vertex`, `replicate`, ...). Always last.
 *
 * Examples:
 *   gpt-image-2-apimart          (model=gpt-image-2, vendor=apimart)
 *   nano-banana-pro-maxapi       (model=nano-banana, variant=pro, vendor=maxapi)
 *   grok-imagine-lite-maxapi     (model=grok-imagine, variant=lite, vendor=maxapi)
 *
 * The id is INTERNAL — never returned to clients. ProductModel.id is the
 * public-facing identity (e.g. `gpt-image-2`); ExecutableModel.id is the
 * server-side execution implementation behind it.
 *
 * ============================================================================
 * Legacy mapping (DB rows pre-rename)
 * ============================================================================
 *
 * Pre-rename DB rows have `internal_model_id` like 'nano-banana-pro' (no
 * vendor suffix). The registry's LEGACY_EXECUTABLE_ID_ALIASES map (see
 * registry.ts) translates those when re-resolving by id, so old rows keep
 * working without a DB migration.
 *
 *   nano-banana-pro   → nano-banana-pro-maxapi
 *   nano-banana       → nano-banana-maxapi
 */

import type { ImageExecutableModel, ImageProductModel } from './types';

// ============================================================================
// ExecutableModels
// ============================================================================

const nanoBananaProExec: ImageExecutableModel = {
  id: 'nano-banana-pro-maxapi',
  family: 'nano-banana',
  version: 'pro',
  // MaxAPI's 'nano-banana-pro' apiModelId serves both T2I and I2I; provider
  // infers mode from input-image presence.
  modality: ['t2i', 'i2i'],
  binding: {
    provider: 'maxapi',
    apiModelId: 'nano-banana-pro',
  },
  capabilities: {
    kind: 'image',
    image: {
      supportedAspectRatios: ['1:1', '3:4', '9:16', '4:3', '16:9'],
      supportedResolutions: ['1K', '2K', '4K'],
      supportedFormats: ['jpg', 'png'],
      maxInputImages: 5,
    },
  },
  // Legacy calculateImageCredits returns flat 3 for nano-banana-pro today.
  cost: { internalCredits: 3 },
  estimatedGenerationTime: 80,
};

const nanoBananaExec: ImageExecutableModel = {
  id: 'nano-banana-maxapi',
  family: 'nano-banana',
  version: '1',
  modality: ['t2i'],
  binding: {
    provider: 'maxapi',
    apiModelId: 'nano-banana',
  },
  capabilities: {
    kind: 'image',
    image: {
      supportedAspectRatios: ['16:9', '9:16'],
      supportedFormats: ['jpg', 'png'],
    },
  },
  cost: { internalCredits: 3 },
  estimatedGenerationTime: 30,
};

// MaxAPI-backed Grok Imagine (lite tier). Surfaced via surface
// `executionRules` to route locale=zh / country=CN traffic to the
// cheaper Grok backend without changing the user-visible model id.
const grokImagineLiteMaxapiExec: ImageExecutableModel = {
  id: 'grok-imagine-lite-maxapi',
  family: 'gpt-image',
  version: '2',
  modality: ['t2i', 'i2i'],
  binding: {
    provider: 'maxapi',
    // apiModelId is informational here; MaxAPIGrokProvider derives the
    // actual upstream endpoint from `providerOptions.grokTier`.
    apiModelId: 'grok-imagine',
    providerOptions: {
      backend: 'grok',
      grokTier: 'lite',
    },
  },
  capabilities: {
    kind: 'image',
    image: {
      // Grok exposes 1:1 / 16:9 / 9:16 only; provider silently degrades
      // 4:3 / 3:4. Declare the user-visible superset so the registry's
      // capabilities-subset check (executable supports product) holds.
      supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      supportedFormats: ['png', 'jpg'],
      maxInputImages: 2,
    },
  },
  cost: { internalCredits: 3 },
  estimatedGenerationTime: 30,
};

// New: Apimart-backed GPT Image 2 executable.
// Not yet referenced by any route — Phase 2 wires it in when gpt-image-2
// product goes live.
const gptImage2ApimartExec: ImageExecutableModel = {
  id: 'gpt-image-2-apimart',
  family: 'gpt-image',
  version: '2',
  modality: ['t2i', 'i2i'],
  binding: {
    provider: 'apimart',
    apiModelId: 'gpt-image-2',
  },
  capabilities: {
    kind: 'image',
    image: {
      // Apimart supports 13 ratios; declare the ones the UI surfaces.
      supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      supportedFormats: ['png', 'jpg'],
      maxInputImages: 16,
    },
  },
  cost: { internalCredits: 3 },
  estimatedGenerationTime: 50,
};

export const IMAGE_EXECUTABLES: ImageExecutableModel[] = [
  nanoBananaProExec,
  nanoBananaExec,
  gptImage2ApimartExec,
  grokImagineLiteMaxapiExec,
];

// ============================================================================
// ProductModels
// ============================================================================

const nanoBananaProProduct: ImageProductModel = {
  slug: 'nano-banana-pro',
  id: 'nano-banana-pro',
  // displayName honest now that gpt-image-2 is a real product on its own. This
  // product stays in the registry so legacy `asset.model_id='nano-banana-pro'`
  // rows still resolve (history UI labels, admin audit), and so any legacy
  // client still sending this id gets a valid route to MaxAPI. Hidden from
  // pickers via visibility='internal'.
  displayName: 'Nano Banana Pro',
  family: 'nano-banana',
  supportedModalities: ['t2i', 'i2i'],
  visibility: 'internal',
  resolver: {
    rules: [],
    fallbackExecutableId: 'nano-banana-pro-maxapi',
  },
  policy: {},
  pricing: {
    externalCredits: 3,
  },
  declaredCapabilities: {
    kind: 'image',
    image: {
      supportedAspectRatios: ['1:1', '3:4', '9:16', '4:3', '16:9'],
      supportedResolutions: ['1K', '2K', '4K'],
      supportedFormats: ['jpg', 'png'],
      maxInputImages: 5,
    },
  },
};

const nanoBananaProduct: ImageProductModel = {
  slug: 'nano-banana',
  id: 'nano-banana',
  displayName: 'Nano Banana',
  family: 'nano-banana',
  supportedModalities: ['t2i'],
  visibility: 'public',
  resolver: {
    rules: [],
    fallbackExecutableId: 'nano-banana-maxapi',
  },
  policy: {},
  pricing: { externalCredits: 3 },
  declaredCapabilities: {
    kind: 'image',
    image: {
      supportedAspectRatios: ['16:9', '9:16'],
      supportedFormats: ['jpg', 'png'],
    },
  },
};

// Public-facing image generation product. Backed by Apimart's gpt-image-2
// upstream. Frontend picker + home route + DEFAULT_IMAGE_MODEL point here.
const gptImage2Product: ImageProductModel = {
  slug: 'gpt-image-2',
  id: 'gpt-image-2',
  displayName: 'GPT Image 2',
  family: 'gpt-image',
  supportedModalities: ['t2i', 'i2i'],
  visibility: 'public',
  resolver: {
    rules: [],
    fallbackExecutableId: 'gpt-image-2-apimart',
  },
  policy: {},
  pricing: { externalCredits: 3 },
  declaredCapabilities: {
    kind: 'image',
    image: {
      supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      supportedFormats: ['png', 'jpg'],
      maxInputImages: 16,
    },
  },
};

export const IMAGE_PRODUCTS: ImageProductModel[] = [
  nanoBananaProProduct,
  nanoBananaProduct,
  gptImage2Product,
];
