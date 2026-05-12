import type { NsfwDetectionInput, NsfwDetectionResult } from './types';

const SAFE_RESULT: NsfwDetectionResult = {
  flagged: false,
  categories: [],
  scores: {},
};

/**
 * Call OpenAI moderation API for a single input (text + at most one image).
 * Returns SAFE_RESULT on any non-ok response so callers can fall through.
 */
async function callModeration(
  apiKey: string,
  moderationInput: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >
): Promise<NsfwDetectionResult> {
  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input: moderationInput,
    }),
  });

  if (!response.ok) {
    return SAFE_RESULT;
  }

  const data = await response.json();
  const result = data.results?.[0];

  if (!result) {
    return SAFE_RESULT;
  }

  const flaggedCategories = Object.entries(result.categories ?? {})
    .filter(([, flagged]) => flagged === true)
    .map(([category]) => category);

  return {
    flagged: result.flagged ?? false,
    categories: flaggedCategories,
    scores: result.category_scores ?? {},
  };
}

/** Merge multiple detection results — flagged if ANY is flagged. */
function mergeResults(results: NsfwDetectionResult[]): NsfwDetectionResult {
  const allCategories = new Set<string>();
  const mergedScores: Record<string, number> = {};
  let flagged = false;

  for (const r of results) {
    if (r.flagged) flagged = true;
    for (const c of r.categories) allCategories.add(c);
    for (const [k, v] of Object.entries(r.scores)) {
      mergedScores[k] = Math.max(mergedScores[k] ?? 0, v);
    }
  }

  return {
    flagged,
    categories: [...allCategories],
    scores: mergedScores,
  };
}

export async function detectNsfw(
  input: NsfwDetectionInput
): Promise<NsfwDetectionResult> {
  if (process.env.NSFW_TEST_FORCE_FLAGGED === 'true') {
    return {
      flagged: true,
      categories: ['test-forced'],
      scores: { 'test-forced': 1 },
    };
  }

  if (!input.prompt && (!input.imageUrls || input.imageUrls.length === 0)) {
    return SAFE_RESULT;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return SAFE_RESULT;
  }

  try {
    const imageUrls = input.imageUrls ?? [];

    // OpenAI omni-moderation-latest only supports one image per request.
    // When multiple images are provided, send parallel requests
    // (prompt + image_i) and merge results — flagged if ANY is flagged.
    if (imageUrls.length <= 1) {
      // Single image (or no image): one request
      const moderationInput: Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      > = [];

      if (input.prompt) {
        moderationInput.push({ type: 'text', text: input.prompt });
      }
      if (imageUrls[0]) {
        moderationInput.push({
          type: 'image_url',
          image_url: { url: imageUrls[0] },
        });
      }

      return await callModeration(apiKey, moderationInput);
    }

    // Multiple images: send parallel requests, one per image (each with the prompt)
    const requests = imageUrls.map((url) => {
      const moderationInput: Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      > = [];

      if (input.prompt) {
        moderationInput.push({ type: 'text', text: input.prompt });
      }
      moderationInput.push({
        type: 'image_url',
        image_url: { url },
      });

      return callModeration(apiKey, moderationInput);
    });

    const results = await Promise.all(requests);
    return mergeResults(results);
  } catch {
    // Network error or other failure: graceful degradation
    return SAFE_RESULT;
  }
}
