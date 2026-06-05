/**
 * Video model registry — minimal Phase-1 split mirroring the image
 * registry pattern (see ./types.ts) but tailored to the existing
 * video pipeline.
 *
 * Why a parallel module instead of extending types.ts:
 *   - Image and video have different ProviderKind sets (image: 5
 *     vendors / video: 10) and different Capabilities shapes (video
 *     has duration / fps / audio fields image doesn't).
 *   - Extending the existing ProductModel/ExecutableModel unions
 *     would force every image consumer to handle an `if video`
 *     branch they don't care about.
 *   - The video registry is derived (not hand-written) from the
 *     existing VIDEO_MODELS + FRONTEND_MODEL_MAPPING dictionaries to
 *     avoid duplication; keeping it isolated also means we can swap
 *     the legacy dicts for hand-written registrations later without
 *     touching the image side.
 *
 * VideoExecutableModel.id == the existing backend id
 * (e.g. `veo3-text-to-video`) so the existing video pipeline's
 * `resolveBackendModelId` keeps working unchanged. Surface execution
 * rules that point at a VideoExecutableModel.id are validated at
 * boot against this registry.
 */

/**
 * Provider channel literals for video. MUST match
 * `VideoModelProvider` in src/video/config/video-models.ts — the
 * runtime dispatch uses the same lowercase strings.
 */
export type VideoProviderKind =
  | 'kie'
  | 'volcano'
  | 'byteplus'
  | 'maxapi'
  | 'apimart'
  | 'apicore'
  | 'fal'
  | 'ali'
  | 'google';

export type VideoMode =
  | 'text-to-video'
  | 'image-to-video'
  | 'reference-to-video'
  | 'first-last-frame-to-video'
  | 'video-edit';

export interface VideoExecutableModel {
  /** Registry id — equals the existing backend modelId (e.g.
   *  `veo3-text-to-video`) so the legacy `resolveBackendModelId`
   *  pipeline continues to work without changes. */
  id: string;
  /** Provider channel that owns the binding. Matches the runtime
   *  `is*Model` dispatch logic in src/video/config/video-models.ts. */
  providerKind: VideoProviderKind;
  mode: VideoMode;
}

export interface VideoProductModel {
  /** Public-facing id sent by the frontend (e.g. `veo-3-1`). Equals
   *  a key of FRONTEND_MODEL_MAPPING in
   *  src/video/config/video-models.ts. */
  id: string;
  displayName: string;
  /** ExecutableModel id used when no surface execution rule matches.
   *  Must reference an entry in VIDEO_EXECUTABLES. Defaults to the
   *  product's `text-to-video` variant from FRONTEND_MODEL_MAPPING. */
  fallbackExecutableId: string;
}
