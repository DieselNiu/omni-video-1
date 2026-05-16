import { describe, expect, it } from 'vitest';
import { NSFW_VIDEO_FALLBACK, getNsfwFallbackModelId } from '../config';

describe('NSFW Fallback Config', () => {
  describe('NSFW_VIDEO_FALLBACK', () => {
    it('should have textToVideo fallback configured', () => {
      expect(NSFW_VIDEO_FALLBACK.textToVideo).toBeDefined();
      expect(NSFW_VIDEO_FALLBACK.textToVideo.fallbackModelId).toBe(
        'wan26-text-to-video'
      );
    });

    it('should have imageToVideo fallback configured', () => {
      expect(NSFW_VIDEO_FALLBACK.imageToVideo).toBeDefined();
      expect(NSFW_VIDEO_FALLBACK.imageToVideo.fallbackModelId).toBe(
        'wan26-i2v-flash'
      );
    });

    it('should have exactly 2 fallback types configured', () => {
      expect(Object.keys(NSFW_VIDEO_FALLBACK)).toHaveLength(2);
    });
  });

  describe('getNsfwFallbackModelId', () => {
    it('should return wan26-text-to-video for textToVideo', () => {
      expect(getNsfwFallbackModelId('textToVideo')).toBe('wan26-text-to-video');
    });

    it('should return wan26-i2v-flash for imageToVideo', () => {
      expect(getNsfwFallbackModelId('imageToVideo')).toBe('wan26-i2v-flash');
    });

    it('should return null for unconfigured type', () => {
      expect(getNsfwFallbackModelId('referenceToVideo' as any)).toBeNull();
    });
  });
});
