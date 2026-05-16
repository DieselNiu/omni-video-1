import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkAndRouteNsfw } from '../routing';

// Mock sub-modules
vi.mock('../detect', () => ({
  detectNsfw: vi.fn(),
}));

vi.mock('../user-tier', () => ({
  isPaidUser: vi.fn(),
}));

vi.mock('../param-mapping', () => ({
  mapParamsToFallback: vi.fn(() => ({
    resolution: '720p',
    aspectRatio: '16:9',
    duration: 5,
    generateAudio: false,
  })),
}));

vi.mock('../config', () => ({
  getNsfwFallbackModelId: vi.fn((type: string) => {
    if (type === 'textToVideo') return 'wan26-text-to-video';
    if (type === 'imageToVideo') return 'wan26-i2v-flash';
    return null;
  }),
}));

// Mock video model config
vi.mock('@/video/config/video-models', () => ({
  getVideoModel: vi.fn((id: string) => {
    const models: Record<string, any> = {
      'veo3-text-to-video': { type: 'text-to-video', supportsNsfw: false },
      'wan26-text-to-video': { type: 'text-to-video', supportsNsfw: true },
      'nsfw-native-model': { type: 'text-to-video', supportsNsfw: true },
      'veo3-image-to-video': { type: 'image-to-video', supportsNsfw: false },
    };
    return models[id];
  }),
  VideoModelType: {
    TEXT_TO_VIDEO: 'text-to-video',
    IMAGE_TO_VIDEO: 'image-to-video',
  },
}));

import { detectNsfw } from '../detect';
import { isPaidUser } from '../user-tier';

describe('NSFW Routing Decision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pass-through scenarios', () => {
    it('should pass when model natively supports NSFW', async () => {
      const result = await checkAndRouteNsfw({
        userId: 'user-1',
        modelId: 'nsfw-native-model',
        prompt: 'anything',
      });

      expect(result.action).toBe('pass');
      expect(detectNsfw).not.toHaveBeenCalled(); // Should skip detection
    });

    it('should pass when content is safe', async () => {
      vi.mocked(detectNsfw).mockResolvedValue({
        flagged: false,
        categories: [],
        scores: {},
      });

      const result = await checkAndRouteNsfw({
        userId: 'user-1',
        modelId: 'veo3-text-to-video',
        prompt: 'a cute cat',
      });

      expect(result.action).toBe('pass');
    });
  });

  describe('Block scenario (free user + NSFW)', () => {
    it('should block free user with NSFW content', async () => {
      vi.mocked(detectNsfw).mockResolvedValue({
        flagged: true,
        categories: ['sexual'],
        scores: { sexual: 0.95 },
      });
      vi.mocked(isPaidUser).mockResolvedValue(false);

      const result = await checkAndRouteNsfw({
        userId: 'free-user',
        modelId: 'veo3-text-to-video',
        prompt: 'nsfw content',
      });

      expect(result.action).toBe('block');
      expect(result.originalModelId).toBe('veo3-text-to-video');
    });
  });

  describe('Fallback scenario (paid user + NSFW)', () => {
    it('should fallback paid user to T2V model', async () => {
      vi.mocked(detectNsfw).mockResolvedValue({
        flagged: true,
        categories: ['sexual'],
        scores: { sexual: 0.95 },
      });
      vi.mocked(isPaidUser).mockResolvedValue(true);

      const result = await checkAndRouteNsfw({
        userId: 'paid-user',
        modelId: 'veo3-text-to-video',
        prompt: 'nsfw content',
      });

      expect(result.action).toBe('fallback');
      expect(result.originalModelId).toBe('veo3-text-to-video');
      expect(result.fallbackModelId).toBe('wan26-text-to-video');
      expect(result.mappedParams).toBeDefined();
    });

    it('should fallback paid user to I2V model', async () => {
      vi.mocked(detectNsfw).mockResolvedValue({
        flagged: true,
        categories: ['violence'],
        scores: { violence: 0.9 },
      });
      vi.mocked(isPaidUser).mockResolvedValue(true);

      const result = await checkAndRouteNsfw({
        userId: 'paid-user',
        modelId: 'veo3-image-to-video',
        prompt: 'nsfw content',
        imageUrls: ['img.jpg'],
      });

      expect(result.action).toBe('fallback');
      expect(result.fallbackModelId).toBe('wan26-i2v-flash');
    });
  });

  describe('Edge cases', () => {
    it('should pass when no fallback model configured for video type', async () => {
      vi.mocked(detectNsfw).mockResolvedValue({
        flagged: true,
        categories: ['sexual'],
        scores: {},
      });
      vi.mocked(isPaidUser).mockResolvedValue(true);

      // Mock a model type with no fallback (e.g., reference-to-video)
      const { getNsfwFallbackModelId } = await import('../config');
      vi.mocked(getNsfwFallbackModelId).mockReturnValueOnce(null);

      const result = await checkAndRouteNsfw({
        userId: 'paid-user',
        modelId: 'veo3-text-to-video',
        prompt: 'nsfw content',
      });

      expect(result.action).toBe('pass'); // Fallback gracefully
    });
  });
});
