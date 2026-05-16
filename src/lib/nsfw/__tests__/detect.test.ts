import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectNsfw } from '../detect';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// 真实 API 响应结构模板
function createMockResponse(overrides: {
  flagged?: boolean;
  categories?: Record<string, boolean>;
  category_scores?: Record<string, number>;
}) {
  const defaultCategories = {
    sexual: false,
    'sexual/minors': false,
    harassment: false,
    'harassment/threatening': false,
    hate: false,
    'hate/threatening': false,
    illicit: false,
    'illicit/violent': false,
    'self-harm': false,
    'self-harm/intent': false,
    'self-harm/instructions': false,
    violence: false,
    'violence/graphic': false,
  };
  const defaultScores = Object.fromEntries(
    Object.keys(defaultCategories).map((k) => [k, 0.0001])
  );
  return {
    ok: true,
    json: async () => ({
      id: 'modr-test-123',
      model: 'omni-moderation-latest',
      results: [
        {
          flagged: overrides.flagged ?? false,
          categories: { ...defaultCategories, ...overrides.categories },
          category_scores: { ...defaultScores, ...overrides.category_scores },
          category_applied_input_types: {
            sexual: ['text'],
            'sexual/minors': ['text'],
            harassment: ['text'],
            'harassment/threatening': ['text'],
            hate: ['text'],
            'hate/threatening': ['text'],
            illicit: ['text'],
            'illicit/violent': ['text'],
            'self-harm': ['text'],
            'self-harm/intent': ['text'],
            'self-harm/instructions': ['text'],
            violence: ['text'],
            'violence/graphic': ['text'],
          },
        },
      ],
    }),
  };
}

describe('NSFW Detection Service', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key-123');
    vi.stubEnv('NSFW_TEST_FORCE_FLAGGED', '');
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('Safe content', () => {
    it('should return flagged=false for safe text', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ flagged: false }));

      const result = await detectNsfw({ prompt: 'a cute cat playing' });

      expect(result.flagged).toBe(false);
      expect(result.categories).toHaveLength(0);
    });
  });

  describe('NSFW content', () => {
    it('should return flagged=true with categories for NSFW text', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          flagged: true,
          categories: { sexual: true },
          category_scores: { sexual: 0.9524 },
        })
      );

      const result = await detectNsfw({ prompt: 'explicit content' });

      expect(result.flagged).toBe(true);
      expect(result.categories).toContain('sexual');
      expect(result.scores.sexual).toBeGreaterThan(0.9);
    });

    it('should return multiple flagged categories', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          flagged: true,
          categories: { sexual: true, violence: true },
          category_scores: { sexual: 0.9, violence: 0.85 },
        })
      );

      const result = await detectNsfw({ prompt: 'test' });

      expect(result.flagged).toBe(true);
      expect(result.categories).toContain('sexual');
      expect(result.categories).toContain('violence');
      expect(result.categories).toHaveLength(2);
    });
  });

  describe('Multi-modal input', () => {
    it('should send both text and image to API', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ flagged: false }));

      await detectNsfw({
        prompt: 'hello',
        imageUrls: ['https://example.com/img.jpg'],
      });

      const [url, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(url).toBe('https://api.openai.com/v1/moderations');
      expect(body.model).toBe('omni-moderation-latest');
      expect(body.input).toHaveLength(2);
      expect(body.input[0]).toEqual({ type: 'text', text: 'hello' });
      expect(body.input[1]).toEqual({
        type: 'image_url',
        image_url: { url: 'https://example.com/img.jpg' },
      });
    });

    it('should send only text when no images', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ flagged: false }));

      await detectNsfw({ prompt: 'hello' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.input).toHaveLength(1);
      expect(body.input[0].type).toBe('text');
    });

    it('should send multiple images as parallel requests', async () => {
      // omni-moderation-latest only supports one image per request, so
      // detect.ts fans out N parallel calls (one per image) and merges results.
      mockFetch.mockResolvedValueOnce(createMockResponse({ flagged: false }));
      mockFetch.mockResolvedValueOnce(createMockResponse({ flagged: false }));

      await detectNsfw({
        imageUrls: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const body1 = JSON.parse(mockFetch.mock.calls[0][1].body);
      const body2 = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body1.input).toHaveLength(1);
      expect(body1.input[0].type).toBe('image_url');
      expect(body2.input).toHaveLength(1);
      expect(body2.input[0].type).toBe('image_url');
    });
  });

  describe('Test mode (NSFW_TEST_FORCE_FLAGGED)', () => {
    it('should return flagged=true when NSFW_TEST_FORCE_FLAGGED=true', async () => {
      vi.stubEnv('NSFW_TEST_FORCE_FLAGGED', 'true');

      const result = await detectNsfw({ prompt: 'anything safe' });

      expect(result.flagged).toBe(true);
      expect(result.categories).toContain('test-forced');
      expect(mockFetch).not.toHaveBeenCalled(); // 不调用真实 API
    });

    it('should call real API when NSFW_TEST_FORCE_FLAGGED is not set', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ flagged: false }));

      await detectNsfw({ prompt: 'test' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Graceful degradation', () => {
    it('should return flagged=false when OPENAI_API_KEY is missing', async () => {
      vi.stubEnv('OPENAI_API_KEY', '');

      const result = await detectNsfw({ prompt: 'anything' });

      expect(result.flagged).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return flagged=false on API HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await detectNsfw({ prompt: 'test' });

      expect(result.flagged).toBe(false);
    });

    it('should return flagged=false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const result = await detectNsfw({ prompt: 'test' });

      expect(result.flagged).toBe(false);
    });

    it('should return flagged=false when input is empty', async () => {
      const result = await detectNsfw({});

      expect(result.flagged).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Authorization header', () => {
    it('should include Bearer token in request', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ flagged: false }));

      await detectNsfw({ prompt: 'test' });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer test-key-123');
    });
  });
});
