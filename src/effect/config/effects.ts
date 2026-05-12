/**
 * Effect configuration layer
 *
 * An "Effect" is a single-purpose landing page that wraps a base model
 * behind a zero-friction UX: the user only uploads an image and clicks
 * Generate. All knobs (prompt, model, aspect ratio, duration, resolution,
 * audio, visibility, etc.) are fixed by the effect config and hidden from
 * the UI.
 */

export type EffectMediaType = 'image' | 'video';

export interface EffectConfig {
  /** Unique effect id, also used as URL slug */
  id: string;
  /** URL slug — same as id by convention */
  slug: string;
  /** Media type of the base model (drives which panel form to render) */
  baseMediaType: EffectMediaType;
  /**
   * Base model id that this effect wraps.
   * For video effects, this MUST be a video model id from
   * `src/video/config/video-models.ts`.
   */
  baseModel: string;
  /**
   * Fixed prompt that is injected on the user's behalf. The user never
   * sees or edits this. Can be a template that references the upload
   * if future effects need it; for v1 it's a static string.
   */
  fixedPrompt: string;
  /** Looping preview video shown in the empty state of ResultFeed */
  previewVideoUrl: string;
  /** Optional poster for the preview video */
  previewPoster?: string;
  /**
   * Fixed aspect ratio — not exposed in the UI. Must be one of the base
   * model's supportedAspectRatios.
   */
  aspectRatio: string;
  /**
   * Fixed video duration in seconds (video effects only). Must be one of
   * the base model's supportedDurations.
   */
  videoDuration?: number;
  /**
   * Fixed video resolution (video effects only). Must be one of the base
   * model's supportedResolutions.
   */
  videoResolution?: string;
  /** Fixed audio flag for video effects that support audio */
  generateAudio?: boolean;
  /** Required credits displayed in the panel (pure display) */
  credits: number;
  /**
   * Number of images the user must upload (default 1). When > 1,
   * the form renders separate upload boxes with labels from
   * `uploadLabels`.
   */
  requiredImages?: number;
  /**
   * Per-slot labels shown above each upload box, e.g.
   * ['Upload Person A', 'Upload Person B']. Length must match
   * `requiredImages`.
   */
  uploadLabels?: string[];
  /** Custom photo requirements shown in the hover card. When omitted,
   *  the default single-person requirements are used. */
  photoRequirements?: {
    positive: string;
    negative: string;
  };
}

export const EFFECTS: Record<string, EffectConfig> = {
  'ai-twerk-video-generator': {
    id: 'ai-twerk-video-generator',
    slug: 'ai-twerk-video-generator',
    baseMediaType: 'video',
    baseModel: 'wan26-image-to-video',
    fixedPrompt:
      'A cinematic vertical video of the subject performing a confident, rhythmic dance, dynamic camera, natural lighting, smooth motion.',
    previewVideoUrl:
      'https://assets.movart.ai/effects/ai-twerk/ai-twerk-01.mp4',
    previewPoster: 'https://assets.movart.ai/effects/ai-twerk/ai-twerk-01.png',
    aspectRatio: '9:16',
    videoDuration: 5,
    videoResolution: '720p',
    generateAudio: false,
    credits: 15,
  },
  'ai-bikini-generator': {
    id: 'ai-bikini-generator',
    slug: 'ai-bikini-generator',
    baseMediaType: 'video',
    baseModel: 'wan26-image-to-video',
    fixedPrompt:
      'A photorealistic, wide full-body cinematic tracking shot based on the input image.',
    previewVideoUrl:
      'https://assets.movart.ai/effects/ai-bikini/ai-bikini-01.mp4',
    previewPoster:
      'https://assets.movart.ai/effects/ai-bikini/ai-bikini-01.jpg',
    aspectRatio: '16:9',
    videoDuration: 5,
    videoResolution: '720p',
    generateAudio: false,
    credits: 15,
  },
  'ai-muscle': {
    id: 'ai-muscle',
    slug: 'ai-muscle',
    baseMediaType: 'video',
    baseModel: 'wan26-image-to-video',
    fixedPrompt: 'Show muscles',
    previewVideoUrl:
      'https://assets.movart.ai/effects/ai-muscle/ai-muscle-01.mp4',
    previewPoster:
      'https://assets.movart.ai/effects/ai-muscle/ai-muscle-01.png',
    aspectRatio: '16:9',
    videoDuration: 5,
    videoResolution: '720p',
    generateAudio: false,
    credits: 15,
  },
  'ai-jiggle-video': {
    id: 'ai-jiggle-video',
    slug: 'ai-jiggle-video',
    baseMediaType: 'video',
    baseModel: 'wan26-image-to-video',
    fixedPrompt: 'Jiggle effect',
    previewVideoUrl:
      'https://assets.movart.ai/effects/jiggle-video/jiggle-video-01.mp4',
    previewPoster:
      'https://assets.movart.ai/effects/jiggle-video/jiggle-video-01.jpg',
    aspectRatio: '16:9',
    videoDuration: 5,
    videoResolution: '720p',
    generateAudio: false,
    credits: 15,
  },
  'ai-huge-generator': {
    id: 'ai-huge-generator',
    slug: 'ai-huge-generator',
    baseMediaType: 'video',
    baseModel: 'seedance-1-0-lite-reference-to-video',
    fixedPrompt: 'Two people hugging',
    previewVideoUrl: 'https://assets.movart.ai/effects/ai-hug/ai-hug-01.mp4',
    previewPoster: 'https://assets.movart.ai/effects/ai-hug/ai-hug-01.png',
    aspectRatio: '16:9',
    videoDuration: 5,
    videoResolution: '720p',
    generateAudio: false,
    credits: 10,
    requiredImages: 2,
    uploadLabels: ['Upload Person A', 'Upload Person B'],
    photoRequirements: {
      positive: 'Clear, well-lit photo of one person with visible face',
      negative: 'No group photos, no heavily obstructed faces',
    },
  },
};

export function getEffect(slug: string): EffectConfig | undefined {
  return EFFECTS[slug];
}

export function getAllEffectSlugs(): string[] {
  return Object.keys(EFFECTS);
}
