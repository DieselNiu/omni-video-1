import type { Asset } from '../types';

export function getAssetMediaUrl(asset: Asset): string | null {
  if (asset.type === 'image') {
    // Check new fields first, then fallback to thumbnailUrl (for legacy data)
    return (
      asset.outputImageUrlsR2?.[0] ??
      asset.outputImageUrls?.[0] ??
      asset.thumbnailUrl ??
      null
    );
  }
  if (asset.type === 'video') {
    return (
      asset.outputVideoUrlR2 ??
      asset.outputVideoUrl ??
      asset.thumbnailUrl ??
      null
    );
  }
  return asset.thumbnailUrl ?? null;
}

export function getAssetThumbnailUrl(asset: Asset): string | null {
  // For images, use the first output image as thumbnail
  if (asset.type === 'image') {
    return (
      asset.thumbnailUrl ??
      asset.outputImageUrlsR2?.[0] ??
      asset.outputImageUrls?.[0] ??
      null
    );
  }
  // For videos, use thumbnailUrl if available, otherwise fall back to video URL
  // (video element will display first frame as preview)
  if (asset.type === 'video') {
    return (
      asset.thumbnailUrl ??
      asset.outputVideoUrlR2 ??
      asset.outputVideoUrl ??
      null
    );
  }
  return asset.thumbnailUrl ?? null;
}

export function isAssetCompleted(asset: Asset): boolean {
  return ['COMPLETED', 'SAVED_TO_R2'].includes(asset.status);
}

export function isAssetProcessing(asset: Asset): boolean {
  return ['PENDING', 'IN_QUEUE', 'IN_PROGRESS'].includes(asset.status);
}
