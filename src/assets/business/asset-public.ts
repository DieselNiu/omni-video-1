import type { Asset } from '@/assets/types';
import {
  pickPublicImageUrls,
  pickPublicVideoUrl,
} from '@/image/utils/public-image-urls';

// Strip internal-only fields before serializing to the client.
// - `metadata` / `executionMetadata` / `logs` / `metrics`: may carry
//   upstreamBackend, channelDecision, provider names, etc.
// - `channel`: exposes the routing target (maxapi/kie/apimart/...).
//
// URL handling: the server picks ONE URL per asset (R2 if present,
// upstream as fallback) and returns it in the public R2 slot. The
// raw upstream-only fields are never exposed — clients can't see
// the provider CDN domain even when R2 lags.
export function toPublicAsset(asset: Asset) {
  const {
    metadata: _metadata,
    executionMetadata: _executionMetadata,
    logs: _logs,
    metrics: _metrics,
    channel: _channel,
    outputImageUrls: rawImageUrls,
    outputImageUrlsR2: rawImageUrlsR2,
    outputVideoUrl: rawVideoUrl,
    outputVideoUrlR2: rawVideoUrlR2,
    ...publicFields
  } = asset;
  return {
    ...publicFields,
    // Single chosen URL surfaced via the *R2 slot only. The upstream
    // fields (`outputImageUrls`, `outputVideoUrl`) are dropped from the
    // response entirely so the client never sees two URLs side by side.
    outputImageUrlsR2: pickPublicImageUrls(rawImageUrlsR2, rawImageUrls),
    outputVideoUrlR2: pickPublicVideoUrl(rawVideoUrlR2, rawVideoUrl),
  };
}

export type PublicAsset = ReturnType<typeof toPublicAsset>;
