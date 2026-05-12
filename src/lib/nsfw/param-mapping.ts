interface UserParams {
  resolution?: string;
  aspectRatio?: string;
  duration?: number;
  generateAudio?: boolean;
  imageUrls?: string[];
  imageRoles?: string[];
}

interface MappedParams {
  [key: string]: unknown;
  resolution: string;
  aspectRatio: string;
  duration: number;
  generateAudio: boolean;
  imageUrls?: string[];
  imageRoles?: string[];
}

interface FallbackModelSpec {
  type: 'text-to-video' | 'image-to-video';
  resolutions: string[];
  defaultResolution: string;
  aspectRatios: string[];
  durations: number[];
  supportsAudio: boolean;
  maxImages: number;
}

const FALLBACK_MODEL_SPECS: Record<string, FallbackModelSpec> = {
  'wan26-text-to-video': {
    type: 'text-to-video',
    resolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    aspectRatios: ['16:9', '9:16', '1:1'],
    durations: [5, 10, 15],
    supportsAudio: true,
    maxImages: 0,
  },
  'wan26-i2v-flash': {
    type: 'image-to-video',
    resolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    aspectRatios: ['Auto', '16:9', '9:16', '1:1'],
    durations: [5, 10, 15],
    supportsAudio: true,
    maxImages: 2,
  },
};

function mapResolution(
  spec: FallbackModelSpec,
  userResolution?: string
): string {
  if (!userResolution) return spec.defaultResolution;
  if (spec.resolutions.includes(userResolution)) return userResolution;
  return spec.defaultResolution;
}

const ASPECT_RATIO_MAP: Record<string, string> = {
  '4:3': '16:9',
  '3:4': '9:16',
  '21:9': '16:9',
};

function mapAspectRatio(
  spec: FallbackModelSpec,
  userAspectRatio?: string
): string {
  if (!userAspectRatio) return '16:9';
  if (spec.aspectRatios.includes(userAspectRatio)) return userAspectRatio;
  if (ASPECT_RATIO_MAP[userAspectRatio])
    return ASPECT_RATIO_MAP[userAspectRatio];
  return '16:9';
}

function mapDuration(spec: FallbackModelSpec, userDuration?: number): number {
  if (spec.durations.length === 1) return spec.durations[0];
  if (!userDuration) return spec.durations[0];

  let closest = spec.durations[0];
  let minDiff = Math.abs(userDuration - closest);
  for (const d of spec.durations) {
    const diff = Math.abs(userDuration - d);
    if (diff < minDiff) {
      minDiff = diff;
      closest = d;
    }
  }
  return closest;
}

function mapImages(
  spec: FallbackModelSpec,
  imageUrls?: string[],
  imageRoles?: string[]
): { imageUrls?: string[]; imageRoles?: string[] } {
  if (spec.maxImages === 0) return {};
  if (!imageUrls || imageUrls.length === 0) return {};

  if (imageUrls.length <= spec.maxImages) {
    return { imageUrls, imageRoles };
  }

  return {
    imageUrls: imageUrls.slice(0, spec.maxImages),
    imageRoles: ['first_frame', 'last_frame'],
  };
}

export function mapParamsToFallback(
  fallbackModelId: string,
  userParams: UserParams
): MappedParams {
  const spec = FALLBACK_MODEL_SPECS[fallbackModelId];
  if (!spec) {
    throw new Error(`Unknown fallback model: ${fallbackModelId}`);
  }

  const imageMapped = mapImages(
    spec,
    userParams.imageUrls,
    userParams.imageRoles
  );

  return {
    resolution: mapResolution(spec, userParams.resolution),
    aspectRatio: mapAspectRatio(spec, userParams.aspectRatio),
    duration: mapDuration(spec, userParams.duration),
    generateAudio: spec.supportsAudio
      ? (userParams.generateAudio ?? false)
      : false,
    ...imageMapped,
  };
}
