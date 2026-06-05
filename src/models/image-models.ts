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
  // infers mode from input-image presence. Kept as the legacy alias target
  // for pre-cutover DB rows (LEGACY_EXECUTABLE_ID_ALIASES).
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
  cost: { internalCredits: 3 },
  estimatedGenerationTime: 80,
};

// Kie-backed Nano Banana Pro. New default route for the `nano-banana-pro`
// product. Posts to /api/v1/jobs/createTask with the v2 body shape
// (input.image_input + aspect_ratio + resolution + output_format).
const nanoBananaProKieExec: ImageExecutableModel = {
  id: 'nano-banana-pro-kie',
  family: 'nano-banana',
  version: 'pro',
  modality: ['t2i', 'i2i'],
  binding: {
    provider: 'kie',
    apiModelId: 'nano-banana-pro',
    providerOptions: { bodyVersion: 'v2' },
  },
  capabilities: {
    kind: 'image',
    image: {
      // Per Kie docs: 11 ratios + auto. Surface the canonical 9 that the
      // dashboard picker exposes; the provider passes through whatever the
      // request specifies.
      supportedAspectRatios: [
        '1:1',
        '2:3',
        '3:2',
        '3:4',
        '4:3',
        '4:5',
        '5:4',
        '9:16',
        '16:9',
        '21:9',
      ],
      supportedResolutions: ['1K', '2K', '4K'],
      supportedFormats: ['png', 'jpg'],
      maxInputImages: 8,
    },
  },
  cost: { internalCredits: 3 },
  estimatedGenerationTime: 80,
};

// Kie-backed Nano Banana 2 (new model). Same endpoint as Pro, different
// `model` value; supports up to 14 reference images and a wider aspect-
// ratio set including extreme cinematic ratios.
const nanoBanana2KieExec: ImageExecutableModel = {
  id: 'nano-banana-2-kie',
  family: 'nano-banana',
  version: '2',
  modality: ['t2i', 'i2i'],
  binding: {
    provider: 'kie',
    apiModelId: 'nano-banana-2',
    providerOptions: { bodyVersion: 'v2' },
  },
  capabilities: {
    kind: 'image',
    image: {
      supportedAspectRatios: [
        '1:1',
        '2:3',
        '3:2',
        '3:4',
        '4:3',
        '4:5',
        '5:4',
        '9:16',
        '16:9',
        '21:9',
      ],
      supportedResolutions: ['1K', '2K', '4K'],
      supportedFormats: ['png', 'jpg'],
      maxInputImages: 14,
    },
  },
  cost: { internalCredits: 3 },
  estimatedGenerationTime: 60,
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
      // Apimart docs list 15 ratios + 1k/2k/4k. Surface all of them so the
      // hero panel's settings popover matches what the upstream accepts.
      supportedAspectRatios: [
        '1:1',
        '3:2',
        '2:3',
        '4:3',
        '3:4',
        '5:4',
        '4:5',
        '16:9',
        '9:16',
        '2:1',
        '1:2',
        '3:1',
        '1:3',
        '21:9',
        '9:21',
      ],
      supportedResolutions: ['1K', '2K', '4K'],
      supportedFormats: ['png', 'jpg'],
      maxInputImages: 16,
    },
  },
  cost: { internalCredits: 3 },
  estimatedGenerationTime: 50,
};

// Apimart-backed Nano Banana standard. This matches Wan30's execution path
// and gives the homepage/workspace standard model the same ratio/reference
// capability surface instead of the legacy two-ratio MaxAPI route.
const APIMART_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '21:9',
];

const nanoBananaApimartExec: ImageExecutableModel = {
  id: 'nano-banana-apimart',
  family: 'nano-banana',
  version: '1',
  modality: ['t2i', 'i2i'],
  binding: {
    provider: 'apimart',
    apiModelId: 'gemini-2.5-flash-image-preview',
  },
  capabilities: {
    kind: 'image',
    image: {
      supportedAspectRatios: APIMART_RATIOS,
      supportedResolutions: ['1K'],
      supportedFormats: ['jpg', 'png'],
      maxInputImages: 14,
    },
  },
  cost: { internalCredits: 3 },
  estimatedGenerationTime: 30,
};

// Freedom -> Alibaba DashScope Wan 2.7 image (standard `wan2.7-image`).
// "Fewer restrictions" creative model. Async DashScope protocol via
// AliImageProvider (channel 'ali', shared ALI_API_KEY, Singapore region).
const freedomAliExec: ImageExecutableModel = {
  id: 'freedom-ali',
  family: 'wan',
  version: '2.7',
  modality: ['t2i', 'i2i'],
  binding: {
    provider: 'ali',
    apiModelId: 'wan2.7-image',
  },
  capabilities: {
    kind: 'image',
    image: {
      supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      supportedResolutions: ['1K', '2K'],
      supportedFormats: ['png', 'jpg'],
      maxInputImages: 9,
    },
  },
  cost: { internalCredits: 3 },
  estimatedGenerationTime: 80,
};

export const IMAGE_EXECUTABLES: ImageExecutableModel[] = [
  nanoBananaProExec,
  nanoBananaProKieExec,
  nanoBanana2KieExec,
  nanoBananaExec,
  gptImage2ApimartExec,
  grokImagineLiteMaxapiExec,
  nanoBananaApimartExec,
  freedomAliExec,
];

// ============================================================================
// ProductModels
// ============================================================================

const nanoBananaProProduct: ImageProductModel = {
  slug: 'nano-banana-pro',
  id: 'nano-banana-pro',
  // Public again now that we route through Kie. Old DB rows with
  // internal_model_id='nano-banana-pro' still resolve through
  // LEGACY_EXECUTABLE_ID_ALIASES → maxapi exec for backfill display.
  displayName: 'Nano Banana Pro',
  family: 'nano-banana',
  supportedModalities: ['t2i', 'i2i'],
  visibility: 'public',
  resolver: {
    // Kie's nano-banana-pro endpoint serves both t2i and i2i — the
    // provider just passes input.image_input through, empty for t2i.
    rules: [],
    fallbackExecutableId: 'nano-banana-pro-kie',
  },
  policy: {},
  picker: {
    description: 'Professional',
    icon: '/icons/models/nano-banana-pro.svg',
  },
  pricing: {
    externalCredits: { '1K': 6, '2K': 12, '4K': 16 },
  },
  declaredCapabilities: {
    kind: 'image',
    image: {
      supportedAspectRatios: [
        '1:1',
        '2:3',
        '3:2',
        '3:4',
        '4:3',
        '4:5',
        '5:4',
        '9:16',
        '16:9',
        '21:9',
      ],
      supportedResolutions: ['1K', '2K', '4K'],
      supportedFormats: ['png', 'jpg'],
      maxInputImages: 8,
    },
  },
};

const nanoBanana2Product: ImageProductModel = {
  slug: 'nano-banana-2',
  id: 'nano-banana-2',
  displayName: 'Nano Banana 2',
  family: 'nano-banana',
  supportedModalities: ['t2i', 'i2i'],
  visibility: 'public',
  resolver: {
    // nano-banana-2's image_input field handles both t2i and i2i natively.
    rules: [],
    fallbackExecutableId: 'nano-banana-2-kie',
  },
  policy: {},
  picker: {
    description: 'Next Gen',
    icon: '/icons/models/nano-banana.svg',
  },
  pricing: { externalCredits: { '1K': 4, '2K': 12, '4K': 16 } },
  declaredCapabilities: {
    kind: 'image',
    image: {
      supportedAspectRatios: [
        '1:1',
        '2:3',
        '3:2',
        '3:4',
        '4:3',
        '4:5',
        '5:4',
        '9:16',
        '16:9',
        '21:9',
      ],
      supportedResolutions: ['1K', '2K', '4K'],
      supportedFormats: ['png', 'jpg'],
      maxInputImages: 14,
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
    fallbackExecutableId: 'nano-banana-apimart',
  },
  policy: {},
  picker: {
    description: 'Standard',
    icon: '/icons/models/nano-banana.svg',
  },
  pricing: { externalCredits: 3 },
  declaredCapabilities: {
    kind: 'image',
    image: {
      supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
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
  picker: {
    description: 'OpenAI',
    icon: '/icons/models/chatgpt.png',
    badges: [{ kind: 'new' }],
  },
  pricing: { externalCredits: { '1K': 4, '2K': 12, '4K': 16 } },
  declaredCapabilities: {
    kind: 'image',
    image: {
      supportedAspectRatios: [
        '1:1',
        '3:2',
        '2:3',
        '4:3',
        '3:4',
        '5:4',
        '4:5',
        '16:9',
        '9:16',
        '2:1',
        '1:2',
        '3:1',
        '1:3',
        '21:9',
        '9:21',
      ],
      supportedResolutions: ['1K', '2K', '4K'],
      supportedFormats: ['png', 'jpg'],
      maxInputImages: 16,
    },
  },
};

// Freedom - public-facing "fewer restrictions" image product, backed by
// DashScope Wan 2.7 (`freedom-ali`). Dashboard/user-paid surface only.
const freedomProduct: ImageProductModel = {
  slug: 'freedom',
  id: 'freedom',
  displayName: 'Freedom',
  family: 'wan',
  supportedModalities: ['t2i', 'i2i'],
  visibility: 'public',
  resolver: {
    rules: [],
    fallbackExecutableId: 'freedom-ali',
  },
  policy: {},
  picker: {
    description: 'Fewer Restrictions',
    icon: '/icons/models/freedom.svg',
  },
  pricing: { externalCredits: { '1K': 5, '2K': 10 } },
  declaredCapabilities: {
    kind: 'image',
    image: {
      supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      supportedResolutions: ['1K', '2K'],
      supportedFormats: ['png', 'jpg'],
      maxInputImages: 9,
    },
  },
};

export const IMAGE_PRODUCTS: ImageProductModel[] = [
  nanoBananaProProduct,
  nanoBanana2Product,
  nanoBananaProduct,
  gptImage2Product,
  freedomProduct,
];
