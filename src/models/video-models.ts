/**
 * Video model registry — derived from the existing
 * src/video/config/video-models.ts dictionaries (`VIDEO_MODELS` and
 * `FRONTEND_MODEL_MAPPING`) so we don't hand-maintain two parallel
 * sources of truth.
 *
 * Each entry in `VIDEO_MODELS` becomes a VideoExecutableModel
 * (registry id == backend model id). Each entry in
 * `FRONTEND_MODEL_MAPPING` becomes a VideoProductModel; its
 * `fallbackExecutableId` defaults to the mapping's `textToVideo`
 * variant.
 *
 * If a future hand-written video product needs richer routing (e.g.
 * surface execution rules pinning a specific backend per region),
 * declare it explicitly here and append to `VIDEO_PRODUCTS` /
 * `VIDEO_EXECUTABLES`. The derive step is additive — there's no
 * conflict with hand-written entries as long as ids stay unique.
 */

import {
  type FrontendModelMapping,
  VIDEO_MODELS,
  VideoModelProvider,
  getSupportedFrontendModelIds,
} from '@/video/config/video-models';
import type {
  VideoExecutableModel,
  VideoMode,
  VideoProductModel,
  VideoProviderKind,
} from './video-types';

// FRONTEND_MODEL_MAPPING is a private const in video-models.ts; we
// reach in via the public `getValidFrontendModelMapping` accessor
// (added below if missing) — but for now we re-derive by exporting a
// helper from this module that consumers can use, and rebuild the
// list here from getSupportedFrontendModelIds + getFrontendModelMapping.
// For Phase-1 derivation, we accept that we read FRONTEND_MODEL_MAPPING
// indirectly through the existing public helpers.

function providerToKind(p: VideoModelProvider): VideoProviderKind {
  switch (p) {
    case VideoModelProvider.KIEAI:
      return 'kie';
    case VideoModelProvider.VOLCANO:
      return 'volcano';
    case VideoModelProvider.BYTEPLUS:
      return 'byteplus';
    case VideoModelProvider.MAXAPI:
      return 'maxapi';
    case VideoModelProvider.APICORE:
      return 'apicore';
    case VideoModelProvider.FAL:
      return 'fal';
    case VideoModelProvider.ALI:
      return 'ali';
    case VideoModelProvider.GOOGLE:
      return 'google';
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}

// VideoModelType enum values are lowercase-hyphen strings
// (`'text-to-video'`, `'image-to-video'`); we match those literals
// here. Anything we don't recognise falls through to text-to-video,
// which is the safe default for the registry's mode metadata.
function videoTypeToMode(type: string): VideoMode {
  switch (type) {
    case 'image-to-video':
      return 'image-to-video';
    case 'reference-to-video':
      return 'reference-to-video';
    case 'first-last-frame-to-video':
      return 'first-last-frame-to-video';
    case 'video-edit':
      return 'video-edit';
    default:
      return 'text-to-video';
  }
}

// Derive executables from VIDEO_MODELS.
export const VIDEO_EXECUTABLES: VideoExecutableModel[] = Object.values(
  VIDEO_MODELS
).map((m) => ({
  id: m.id,
  providerKind: providerToKind(m.provider),
  mode: videoTypeToMode(m.type),
}));

// Derive products from FRONTEND_MODEL_MAPPING. We surface the
// `textToVideo` variant as the default fallback executable; surface
// execution rules can override based on hasInputImage / locale / etc.
export const VIDEO_PRODUCTS: VideoProductModel[] = (() => {
  const ids = getSupportedFrontendModelIds();
  const out: VideoProductModel[] = [];
  for (const id of ids) {
    // The mapping's textToVideo is the canonical default; image-to-
    // video and reference-to-video are mode-specific and selected by
    // the existing `resolveBackendModelId` based on request shape.
    // Use the mapping helper indirectly by trying a plain text submit
    // (no input image, no generationType) — which is exactly what
    // resolveBackendModelId does internally.
    const mapping = getFrontendMapping(id);
    if (!mapping) continue;
    out.push({
      id,
      displayName: id,
      fallbackExecutableId: mapping.textToVideo,
    });
  }
  return out;
})();

// Re-export the private FRONTEND_MODEL_MAPPING via a thin accessor so
// the derivation above can read each product's textToVideo variant.
// (`video-models.ts` doesn't export FRONTEND_MODEL_MAPPING directly;
// adding the accessor keeps the existing module's surface intact.)
function getFrontendMapping(id: string): FrontendModelMapping | undefined {
  // resolveBackendModelId(id, false, undefined) returns the textToVideo
  // backend; if missing it throws. We catch and return undefined so
  // an unknown id silently skips.
  try {
    // Lazy require avoids a circular module load ordering with the
    // FRONTEND_MODEL_MAPPING constants in video-config.
    const mod =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/video/config/video-models') as typeof import(
        '@/video/config/video-models'
      );
    const t2v = mod.resolveBackendModelId(id, false, undefined);
    return { textToVideo: t2v } as FrontendModelMapping;
  } catch {
    return undefined;
  }
}

export function getVideoExecutableById(
  id: string
): VideoExecutableModel | undefined {
  return VIDEO_EXECUTABLES.find((e) => e.id === id);
}

export function getVideoProductById(id: string): VideoProductModel | undefined {
  return VIDEO_PRODUCTS.find((p) => p.id === id);
}
