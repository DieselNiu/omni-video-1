import { describe, expect, it } from 'vitest';
import { mapParamsToFallback } from '../param-mapping';

describe('NSFW Parameter Mapping', () => {
  // ========== Resolution Mapping ==========
  describe('Resolution mapping — wan26-text-to-video (T2V)', () => {
    it('1080p → 1080p', () => {
      const result = mapParamsToFallback('wan26-text-to-video', {
        resolution: '1080p',
      });
      expect(result.resolution).toBe('1080p');
    });

    it('720p → 720p', () => {
      const result = mapParamsToFallback('wan26-text-to-video', {
        resolution: '720p',
      });
      expect(result.resolution).toBe('720p');
    });

    it('480p → 720p (default)', () => {
      const result = mapParamsToFallback('wan26-text-to-video', {
        resolution: '480p',
      });
      expect(result.resolution).toBe('720p');
    });

    it('undefined → 720p (default)', () => {
      const result = mapParamsToFallback('wan26-text-to-video', {});
      expect(result.resolution).toBe('720p');
    });
  });

  describe('Resolution mapping — wan26-i2v-flash (I2V)', () => {
    it('1080p → 1080p', () => {
      const result = mapParamsToFallback('wan26-i2v-flash', {
        resolution: '1080p',
      });
      expect(result.resolution).toBe('1080p');
    });

    it('720p → 720p', () => {
      const result = mapParamsToFallback('wan26-i2v-flash', {
        resolution: '720p',
      });
      expect(result.resolution).toBe('720p');
    });

    it('480p → 720p', () => {
      const result = mapParamsToFallback('wan26-i2v-flash', {
        resolution: '480p',
      });
      expect(result.resolution).toBe('720p');
    });
  });

  // ========== Aspect Ratio Mapping ==========
  describe('Aspect ratio mapping', () => {
    it('16:9 → 16:9 (supported)', () => {
      const result = mapParamsToFallback('wan26-text-to-video', {
        aspectRatio: '16:9',
      });
      expect(result.aspectRatio).toBe('16:9');
    });

    it('9:16 → 9:16 (supported)', () => {
      const result = mapParamsToFallback('wan26-text-to-video', {
        aspectRatio: '9:16',
      });
      expect(result.aspectRatio).toBe('9:16');
    });

    it('1:1 → 1:1 (supported)', () => {
      const result = mapParamsToFallback('wan26-text-to-video', {
        aspectRatio: '1:1',
      });
      expect(result.aspectRatio).toBe('1:1');
    });

    it('4:3 → 16:9 (closest landscape)', () => {
      const result = mapParamsToFallback('wan26-text-to-video', {
        aspectRatio: '4:3',
      });
      expect(result.aspectRatio).toBe('16:9');
    });

    it('3:4 → 9:16 (closest portrait)', () => {
      const result = mapParamsToFallback('wan26-text-to-video', {
        aspectRatio: '3:4',
      });
      expect(result.aspectRatio).toBe('9:16');
    });

    it('21:9 → 16:9 (closest widescreen)', () => {
      const result = mapParamsToFallback('wan26-text-to-video', {
        aspectRatio: '21:9',
      });
      expect(result.aspectRatio).toBe('16:9');
    });

    it('Auto → Auto for wan26 (supported)', () => {
      const result = mapParamsToFallback('wan26-i2v-flash', {
        aspectRatio: 'Auto',
      });
      expect(result.aspectRatio).toBe('Auto');
    });

    it('Auto → 16:9 for wan22 (not supported)', () => {
      const result = mapParamsToFallback('wan26-text-to-video', {
        aspectRatio: 'Auto',
      });
      expect(result.aspectRatio).toBe('16:9');
    });
  });

  // ========== Duration Mapping ==========
  describe('Duration mapping — wan26-text-to-video (5, 10, 15)', () => {
    it('5 → 5 (exact)', () => {
      expect(
        mapParamsToFallback('wan26-text-to-video', { duration: 5 }).duration
      ).toBe(5);
    });

    it('8 → 10 (closest)', () => {
      expect(
        mapParamsToFallback('wan26-text-to-video', { duration: 8 }).duration
      ).toBe(10);
    });

    it('15 → 15 (exact)', () => {
      expect(
        mapParamsToFallback('wan26-text-to-video', { duration: 15 }).duration
      ).toBe(15);
    });
  });

  describe('Duration mapping — wan26-i2v-flash (5, 10, 15)', () => {
    it('3 → 5 (closest)', () => {
      expect(
        mapParamsToFallback('wan26-i2v-flash', { duration: 3 }).duration
      ).toBe(5);
    });

    it('5 → 5 (exact)', () => {
      expect(
        mapParamsToFallback('wan26-i2v-flash', { duration: 5 }).duration
      ).toBe(5);
    });

    it('8 → 10 (closest)', () => {
      expect(
        mapParamsToFallback('wan26-i2v-flash', { duration: 8 }).duration
      ).toBe(10);
    });

    it('10 → 10 (exact)', () => {
      expect(
        mapParamsToFallback('wan26-i2v-flash', { duration: 10 }).duration
      ).toBe(10);
    });

    it('12 → 10 (closest)', () => {
      expect(
        mapParamsToFallback('wan26-i2v-flash', { duration: 12 }).duration
      ).toBe(10);
    });

    it('13 → 15 (closest)', () => {
      expect(
        mapParamsToFallback('wan26-i2v-flash', { duration: 13 }).duration
      ).toBe(15);
    });

    it('15 → 15 (exact)', () => {
      expect(
        mapParamsToFallback('wan26-i2v-flash', { duration: 15 }).duration
      ).toBe(15);
    });
  });

  // ========== Audio Mapping ==========
  describe('Audio mapping', () => {
    it('wan26-text-to-video (audio supported) + user on → true', () => {
      expect(
        mapParamsToFallback('wan26-text-to-video', { generateAudio: true })
          .generateAudio
      ).toBe(true);
    });

    it('wan26-text-to-video (audio supported) + user off → false', () => {
      expect(
        mapParamsToFallback('wan26-text-to-video', { generateAudio: false })
          .generateAudio
      ).toBe(false);
    });

    it('wan26 (audio supported) + user on → true', () => {
      expect(
        mapParamsToFallback('wan26-i2v-flash', { generateAudio: true })
          .generateAudio
      ).toBe(true);
    });

    it('wan26 (audio supported) + user off → false', () => {
      expect(
        mapParamsToFallback('wan26-i2v-flash', { generateAudio: false })
          .generateAudio
      ).toBe(false);
    });
  });

  // ========== Image Input Mapping ==========
  describe('Image input mapping', () => {
    it('T2V fallback: drop all images', () => {
      const result = mapParamsToFallback('wan26-text-to-video', {
        imageUrls: ['img1.jpg', 'img2.jpg'],
        imageRoles: ['first_frame', 'last_frame'],
      });
      expect(result.imageUrls).toBeUndefined();
      expect(result.imageRoles).toBeUndefined();
    });

    it('I2V fallback: 1 image → keep as-is', () => {
      const result = mapParamsToFallback('wan26-i2v-flash', {
        imageUrls: ['img1.jpg'],
        imageRoles: ['first_frame'],
      });
      expect(result.imageUrls).toEqual(['img1.jpg']);
      expect(result.imageRoles).toEqual(['first_frame']);
    });

    it('I2V fallback: 2 images → keep as-is', () => {
      const result = mapParamsToFallback('wan26-i2v-flash', {
        imageUrls: ['img1.jpg', 'img2.jpg'],
        imageRoles: ['first_frame', 'last_frame'],
      });
      expect(result.imageUrls).toEqual(['img1.jpg', 'img2.jpg']);
      expect(result.imageRoles).toEqual(['first_frame', 'last_frame']);
    });

    it('I2V fallback: 4 reference images → truncate to 2, remap roles', () => {
      const result = mapParamsToFallback('wan26-i2v-flash', {
        imageUrls: ['ref1.jpg', 'ref2.jpg', 'ref3.jpg', 'ref4.jpg'],
        imageRoles: [
          'reference_image',
          'reference_image',
          'reference_image',
          'reference_image',
        ],
      });
      expect(result.imageUrls).toEqual(['ref1.jpg', 'ref2.jpg']);
      expect(result.imageRoles).toEqual(['first_frame', 'last_frame']);
    });

    it('I2V fallback: 3 reference images → truncate to 2', () => {
      const result = mapParamsToFallback('wan26-i2v-flash', {
        imageUrls: ['ref1.jpg', 'ref2.jpg', 'ref3.jpg'],
        imageRoles: ['reference_image', 'reference_image', 'reference_image'],
      });
      expect(result.imageUrls).toHaveLength(2);
    });

    it('no images → no images in output', () => {
      const result = mapParamsToFallback('wan26-i2v-flash', {});
      expect(result.imageUrls).toBeUndefined();
    });
  });

  // ========== Error Handling ==========
  describe('Error handling', () => {
    it('should throw for unknown fallback model ID', () => {
      expect(() => mapParamsToFallback('nonexistent-model', {})).toThrow();
    });
  });
});
