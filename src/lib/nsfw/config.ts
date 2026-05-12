interface FallbackModelConfig {
  fallbackModelId: string;
}

export const NSFW_VIDEO_FALLBACK: Record<string, FallbackModelConfig> = {
  textToVideo: {
    fallbackModelId: 'wan26-text-to-video',
  },
  imageToVideo: {
    fallbackModelId: 'wan26-i2v-flash',
  },
};

export function getNsfwFallbackModelId(type: string): string | null {
  return NSFW_VIDEO_FALLBACK[type]?.fallbackModelId ?? null;
}
