// Video model types
export enum VideoModelType {
  TEXT_TO_VIDEO = 'text-to-video',
  IMAGE_TO_VIDEO = 'image-to-video',
  VIDEO_EDIT = 'video-edit',
}

// Video model providers
export enum VideoModelProvider {
  KIEAI = 'kie',
  VOLCANO = 'volcano',
  BYTEPLUS = 'byteplus',
  MAXAPI = 'maxapi',
  APIMART = 'apimart',
  APICORE = 'apicore',
  FAL = 'fal',
  ALI = 'ali',
  GOOGLE = 'google', // Google official Gemini API for Veo 3.1
}

// Resolution-based pricing type
export type ResolutionPricing = {
  '480p'?: number;
  '720p'?: number;
  '1080p'?: number;
  '2k'?: number;
  '4k'?: number;
};

type GeminiOmniResolution = '720p' | '1080p' | '4k';
type GeminiOmniDuration = 4 | 6 | 8 | 10;

const GEMINI_OMNI_NO_VIDEO_INPUT_CREDITS: Record<
  GeminiOmniResolution,
  Record<GeminiOmniDuration, number>
> = {
  '720p': { 4: 60, 6: 80, 8: 100, 10: 120 },
  '1080p': { 4: 60, 6: 80, 8: 100, 10: 120 },
  '4k': { 4: 140, 6: 160, 8: 180, 10: 200 },
};

const GEMINI_OMNI_WITH_VIDEO_INPUT_CREDITS: Record<
  GeminiOmniResolution,
  number
> = {
  '720p': 160,
  '1080p': 160,
  '4k': 240,
};

// Video model configuration interface
export interface VideoModelConfig {
  id: string;
  name: string;
  type: VideoModelType;
  provider: VideoModelProvider;
  displayName: string;
  perSecondCredits: number | ResolutionPricing; // credits per second, can be a single value or resolution-based
  description?: string;
  features?: string[];
  maxDuration?: number;
  supportedAspectRatios?: string[];
  supportsAudio?: boolean;
  supportedDurations?: number[];
  supportedResolutions?: string[];
  audioPremiumCredits?: number; // extra credits for audio
  estimatedGenerationTime?: number; // estimated time in seconds
  generationType?: string; // e.g., REFERENCE_2_VIDEO
  imageCapabilities?: {
    maxImages: number;
    minImages?: number;
    labels?: string[];
    flexibleMode?: boolean;
  };
  supportsNsfw?: boolean; // true = natively supports NSFW content, no fallback needed
  isInternalOnly?: boolean; // true = internal fallback model, hidden from frontend UI
  // true = reference mode accepts reference videos/audio in addition to images
  // (Apimart Seedance 2.0 face models).
  supportsReferenceMedia?: boolean;
  // Provider-specific model IDs
  volcanoModel?: string; // Volcano Engine model ID
  aliModel?: string; // Ali Bailian model ID
  falEndpoint?: string; // Fal.ai endpoint
}

// Video model configurations
export const VIDEO_MODELS: Record<string, VideoModelConfig> = {
  // Gemini Omni unified multimodal video generation (Kie.ai)
  'gemini-omni-video': {
    id: 'gemini-omni-video',
    name: 'Gemini Omni Video',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.KIEAI,
    displayName: 'Gemini Omni',
    perSecondCredits: 0,
    description:
      'Kie Gemini Omni multimodal video generation with image and video references',
    features: ['Wait 180s', '720p/1080p/4K', 'Image/Video References'],
    maxDuration: 10,
    supportedAspectRatios: ['16:9', '9:16'],
    supportedDurations: [4, 6, 8, 10],
    supportedResolutions: ['720p', '1080p', '4k'],
    supportsAudio: false,
    estimatedGenerationTime: 180,
    imageCapabilities: {
      maxImages: 7,
      minImages: 1,
      labels: ['References'],
    },
    generationType: 'REFERENCE_2_VIDEO',
    supportsNsfw: true,
  },

  // Veo3 text-to-video
  'veo3-text-to-video': {
    id: 'veo3-text-to-video',
    name: 'Veo3 Text-to-Video',
    type: VideoModelType.TEXT_TO_VIDEO,
    provider: VideoModelProvider.KIEAI,
    displayName: 'Google Veo 3.1',
    perSecondCredits: 2.5,
    description: 'Google Veo 3.1 model',
    features: ['Wait 120s', 'Audio'],
    maxDuration: 8,
    supportedAspectRatios: ['Auto', '16:9', '9:16'],
    supportsAudio: true,
    estimatedGenerationTime: 120,
    supportedDurations: [8],
    supportedResolutions: ['1080p'],
  },

  // Veo3 image-to-video
  'veo3-image-to-video': {
    id: 'veo3-image-to-video',
    name: 'Veo3 Image-to-Video',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.KIEAI,
    displayName: 'Google Veo 3.1',
    perSecondCredits: 2.5,
    description: 'Google Veo 3.1 model',
    features: ['Wait 120s', 'Audio', 'Support 1-2 images'],
    maxDuration: 8,
    supportedAspectRatios: ['Auto', '16:9', '9:16'],
    supportsAudio: true,
    estimatedGenerationTime: 120,
    supportedDurations: [8],
    supportedResolutions: ['1080p'],
    imageCapabilities: {
      maxImages: 2,
      minImages: 1,
      labels: ['First Frame', 'Last Frame'],
      flexibleMode: true, // User can upload 1 or 2 images
    },
    generationType: 'FIRST_AND_LAST_FRAMES_2_VIDEO',
  },

  // Veo3 reference-to-video (consistent character)
  'veo3-reference-to-video': {
    id: 'veo3-reference-to-video',
    name: 'Veo3 Reference-to-Video',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.KIEAI,
    displayName: 'Google Veo 3.1 (Consistent Character)',
    perSecondCredits: 5.5,
    description:
      'Create videos with consistent character identity using 1-3 reference images',
    features: ['Wait 240s', 'Character Consistency', '1-3 Reference Images'],
    supportedAspectRatios: ['16:9'],
    supportedDurations: [8],
    supportedResolutions: ['1080p'],
    supportsAudio: false,
    imageCapabilities: {
      maxImages: 3,
      minImages: 1,
      labels: ['Reference 1', 'Reference 2', 'Reference 3'],
    },
    estimatedGenerationTime: 240,
    generationType: 'REFERENCE_2_VIDEO',
  },

  // Sora 2 text-to-video (Standard mode - 720p)
  'sora-2-text-to-video': {
    id: 'sora-2-text-to-video',
    name: 'Sora 2 Text-to-Video',
    type: VideoModelType.TEXT_TO_VIDEO,
    provider: VideoModelProvider.KIEAI,
    displayName: 'Sora 2',
    perSecondCredits: 2, // Standard mode, cheaper than Pro
    description: "OpenAI's Sora 2 model",
    features: ['Wait 300s', 'Audio'],
    maxDuration: 15,
    supportedAspectRatios: ['16:9', '9:16'],
    supportsAudio: true,
    estimatedGenerationTime: 300,
    supportedDurations: [10, 15],
    supportedResolutions: ['720p'],
  },

  // Sora 2 image-to-video (Standard mode - 720p)
  'sora-2-image-to-video': {
    id: 'sora-2-image-to-video',
    name: 'Sora 2 Image-to-Video',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.KIEAI,
    displayName: 'Sora 2',
    perSecondCredits: 2, // Standard mode, cheaper than Pro
    description: "OpenAI's Sora 2 model",
    features: ['Wait 300s', 'Audio'],
    maxDuration: 15,
    supportedAspectRatios: ['16:9', '9:16'],
    supportsAudio: true,
    estimatedGenerationTime: 300,
    supportedDurations: [10, 15],
    supportedResolutions: ['720p'],
    imageCapabilities: {
      maxImages: 1,
      labels: ['First Frame'],
    },
  },

  // ==================== BytePlus Seedance Pro ====================

  // Seedance 1.0 Pro Fast text-to-video
  'seedance-1.0-pro-text-to-video': {
    id: 'seedance-1.0-pro-text-to-video',
    name: 'Seedance 1.0 Pro Fast Text-to-Video',
    type: VideoModelType.TEXT_TO_VIDEO,
    provider: VideoModelProvider.BYTEPLUS,
    volcanoModel: 'seedance-1-0-pro-fast-251015',
    displayName: 'Seedance 1.0 Pro Fast',
    perSecondCredits: 2,
    description: 'BytePlus Seedance 1.0 Pro Fast, fast video generation',
    features: ['Wait 30s', '480p-1080p', 'Fast'],
    maxDuration: 12,
    supportedAspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
    supportedDurations: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    supportedResolutions: ['480p', '720p', '1080p'],
    estimatedGenerationTime: 30,
  },

  // Seedance 1.0 Pro Fast image-to-video
  'seedance-1.0-pro-image-to-video': {
    id: 'seedance-1.0-pro-image-to-video',
    name: 'Seedance 1.0 Pro Fast Image-to-Video',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.BYTEPLUS,
    volcanoModel: 'seedance-1-0-pro-fast-251015',
    displayName: 'Seedance 1.0 Pro Fast',
    perSecondCredits: 2,
    description: 'BytePlus Seedance 1.0 Pro Fast image-to-video',
    features: ['Wait 30s', '480p-1080p', 'Fast'],
    maxDuration: 12,
    supportedAspectRatios: [
      'Auto',
      '16:9',
      '4:3',
      '1:1',
      '3:4',
      '9:16',
      '21:9',
    ],
    supportedDurations: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    supportedResolutions: ['480p', '720p', '1080p'],
    estimatedGenerationTime: 30,
    imageCapabilities: {
      maxImages: 1,
      labels: ['First Frame'],
    },
  },

  // BytePlus Seedance 1.0 Lite reference-to-video (multi-reference images)
  'seedance-1-0-lite-reference-to-video': {
    id: 'seedance-1-0-lite-reference-to-video',
    name: 'BytePlus Seedance 1.0 Lite Reference-to-Video',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.BYTEPLUS,
    volcanoModel: 'seedance-1-0-lite-i2v-250428',
    displayName: 'Seedance 1.0 Pro',
    perSecondCredits: 2,
    description:
      'BytePlus Seedance 1.0 Lite for multi-reference image video generation',
    features: ['Wait 60s', '480p/720p', 'Reference Images'],
    maxDuration: 12,
    supportedAspectRatios: [
      'Auto',
      '16:9',
      '4:3',
      '1:1',
      '3:4',
      '9:16',
      '21:9',
    ],
    supportedDurations: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    supportedResolutions: ['480p', '720p'],
    estimatedGenerationTime: 60,
    imageCapabilities: {
      maxImages: 4,
      labels: ['Reference Images'],
    },
  },

  // ==================== Ali Wan 2.6 (阿里百炼) ====================

  // Wan2.6 text-to-video
  'wan26-text-to-video': {
    id: 'wan26-text-to-video',
    name: 'Wan2.6 Text-to-Video',
    type: VideoModelType.TEXT_TO_VIDEO,
    provider: VideoModelProvider.ALI,
    aliModel: 'wan2.6-t2v',
    displayName: 'Wan 2.6',
    perSecondCredits: {
      '720p': 14,
      '1080p': 20,
    },
    description: 'Ali Bailian Wan 2.6 model with audio support',
    features: ['Wait 120s', '720p/1080p', 'Audio'],
    maxDuration: 15,
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    supportedDurations: [5, 10, 15],
    supportedResolutions: ['720p', '1080p'],
    supportsAudio: true,
    estimatedGenerationTime: 120,
    supportsNsfw: true,
  },

  // Wan2.6 image-to-video
  'wan26-image-to-video': {
    id: 'wan26-image-to-video',
    name: 'Wan2.6 Image-to-Video',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.ALI,
    aliModel: 'wan2.6-i2v-flash',
    displayName: 'Wan 2.6',
    perSecondCredits: {
      '720p': 14,
      '1080p': 20,
    },
    description: 'Ali Bailian Wan 2.6 image-to-video with audio support',
    features: ['Wait 120s', '720p/1080p', 'Audio'],
    maxDuration: 15,
    supportedAspectRatios: ['Auto', '16:9', '9:16', '1:1'],
    supportedDurations: [5, 10, 15],
    supportedResolutions: ['720p', '1080p'],
    supportsAudio: true,
    estimatedGenerationTime: 120,
    imageCapabilities: {
      maxImages: 2,
      minImages: 1,
      labels: ['First Frame', 'Last Frame'],
      flexibleMode: true, // 1 image → I2V, 2 images → first-last-frame
    },
  },

  // ==================== Ali Wan 2.2 (阿里百炼) ====================

  // Wan2.2 text-to-video
  'wan22-text-to-video': {
    id: 'wan22-text-to-video',
    name: 'Wan2.2 Text-to-Video',
    type: VideoModelType.TEXT_TO_VIDEO,
    provider: VideoModelProvider.ALI,
    aliModel: 'wan2.2-t2v-plus',
    displayName: 'Wan 2.2',
    perSecondCredits: {
      '480p': 2,
      '1080p': 3,
    },
    description: 'Ali Bailian Wan 2.2 model, fast and cost-effective',
    features: ['Wait 60s', '480p/1080p', 'Silent'],
    maxDuration: 5, // Fixed 5 seconds
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    supportedDurations: [5],
    supportedResolutions: ['480p', '1080p'],
    supportsAudio: false, // Wan 2.2 generates silent videos
    estimatedGenerationTime: 60,
  },

  // Wan2.2 first-and-last-frame to video
  'wan22-kf2v': {
    id: 'wan22-kf2v',
    name: 'Wan2.2 First-Last-Frame to Video',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.ALI,
    aliModel: 'wan2.2-kf2v-flash',
    displayName: 'Wan 2.6',
    perSecondCredits: {
      '480p': 2,
      '720p': 2,
      '1080p': 3,
    },
    description: 'Ali Bailian Wan first-and-last-frame video generation',
    features: ['Wait 60s', '480p/720p/1080p', 'First & Last Frame'],
    maxDuration: 5, // Fixed 5 seconds for kf2v
    supportedAspectRatios: ['Auto'],
    supportedDurations: [5],
    supportedResolutions: ['480p', '720p', '1080p'],
    supportsAudio: false, // kf2v produces silent videos
    estimatedGenerationTime: 60,
    imageCapabilities: {
      maxImages: 2,
      minImages: 2,
      labels: ['First Frame', 'Last Frame'],
    },
    generationType: 'FIRST_AND_LAST_FRAMES_2_VIDEO',
  },

  // ==================== Ali Wan 2.7 Video Edit ====================

  // Wan2.7 video edit (instruction-based + optional reference images)
  'wan27-video-edit': {
    id: 'wan27-video-edit',
    name: 'Wan2.7 Video Edit',
    type: VideoModelType.VIDEO_EDIT,
    provider: VideoModelProvider.ALI,
    aliModel: 'wan2.7-videoedit',
    displayName: 'Wan 2.7',
    // Ali bills duration = input_video_duration + output_video_duration,
    // so a 5s input that produces a 5s output is billed as 10s. The rate
    // mirrors wan2.6 i2v since both go through the same async pipeline.
    perSecondCredits: {
      '720p': 14,
      '1080p': 20,
    },
    description: 'Ali Bailian Wan 2.7 instruction-driven video editing',
    features: ['Wait 120s', '720p/1080p', 'Edit'],
    maxDuration: 10,
    supportedAspectRatios: ['Auto', '16:9', '9:16', '1:1', '4:3', '3:4'],
    supportedDurations: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    supportedResolutions: ['720p', '1080p'],
    supportsAudio: false,
    estimatedGenerationTime: 120,
    generationType: 'VIDEO_EDIT',
    imageCapabilities: {
      maxImages: 4,
      minImages: 0,
      labels: ['Reference Images'],
    },
  },

  // Wan2.7 reference-to-video (multi-subject reference: images + videos + voice)
  'wan27-reference-to-video': {
    id: 'wan27-reference-to-video',
    name: 'Wan2.7 Reference-to-Video',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.ALI,
    aliModel: 'wan2.7-r2v',
    displayName: 'Wan 2.7',
    perSecondCredits: {
      '720p': 14,
      '1080p': 20,
    },
    description:
      'Ali Bailian Wan 2.7 multi-subject reference-to-video (images, video, and voice references)',
    features: [
      'Wait 120s',
      '720p/1080p',
      'Up to 5 references',
      'Voice cloning',
    ],
    maxDuration: 15,
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    supportedDurations: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['720p', '1080p'],
    supportsAudio: true,
    estimatedGenerationTime: 120,
    generationType: 'REFERENCE_2_VIDEO',
    imageCapabilities: {
      maxImages: 5,
      minImages: 1,
      labels: ['Reference Images'],
    },
  },

  // ==================== Sora 2 Pro ====================

  // Sora 2 Pro text-to-video (High mode - 1080p)
  'sora-2-pro-text-to-video': {
    id: 'sora-2-pro-text-to-video',
    name: 'Sora 2 Pro Text-to-Video',
    type: VideoModelType.TEXT_TO_VIDEO,
    provider: VideoModelProvider.KIEAI,
    displayName: 'Sora 2 Pro',
    perSecondCredits: 7, // Pro High mode: $3.15/15s cost, 7 credits/s = 105 credits/15s, ~60% margin
    description: "OpenAI's Sora 2 Pro model",
    features: ['Wait 300s', 'Audio', 'Higher Quality'],
    maxDuration: 15,
    supportedAspectRatios: ['16:9', '9:16'],
    supportsAudio: true,
    estimatedGenerationTime: 300,
    supportedDurations: [10, 15],
    supportedResolutions: ['1080p'],
  },

  // Sora 2 Pro image-to-video (High mode - 1080p)
  'sora-2-pro-image-to-video': {
    id: 'sora-2-pro-image-to-video',
    name: 'Sora 2 Pro Image-to-Video',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.KIEAI,
    displayName: 'Sora 2 Pro',
    perSecondCredits: 7, // Pro High mode: $3.15/15s cost, 7 credits/s = 105 credits/15s, ~60% margin
    description: "OpenAI's Sora 2 Pro model",
    features: ['Wait 300s', 'Audio', 'Higher Quality'],
    maxDuration: 15,
    supportedAspectRatios: ['16:9', '9:16'],
    supportsAudio: true,
    estimatedGenerationTime: 300,
    supportedDurations: [10, 15],
    supportedResolutions: ['1080p'],
    imageCapabilities: {
      maxImages: 1,
      labels: ['First Frame'],
    },
  },

  // ==================== Seedance 1.5 Pro ====================

  // Seedance 1.5 Pro text-to-video
  'seedance-1.5-pro-text-to-video': {
    id: 'seedance-1.5-pro-text-to-video',
    name: 'Seedance 1.5 Pro Text-to-Video',
    type: VideoModelType.TEXT_TO_VIDEO,
    provider: VideoModelProvider.BYTEPLUS,
    volcanoModel: 'seedance-1-5-pro-251215',
    displayName: 'Seedance 1.5 Pro',
    perSecondCredits: 3,
    audioPremiumCredits: 3, // Audio doubles the price
    description:
      'BytePlus Seedance 1.5 Pro, latest high-quality video generation with audio support',
    features: ['Wait 30s', '480p-1080p', 'Audio'],
    maxDuration: 12,
    supportedAspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    supportedResolutions: ['480p', '720p', '1080p'],
    supportsAudio: true,
    estimatedGenerationTime: 30,
  },

  // Seedance 1.5 Pro image-to-video
  'seedance-1.5-pro-image-to-video': {
    id: 'seedance-1.5-pro-image-to-video',
    name: 'Seedance 1.5 Pro Image-to-Video',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.BYTEPLUS,
    volcanoModel: 'seedance-1-5-pro-251215',
    displayName: 'Seedance 1.5 Pro',
    perSecondCredits: 3,
    audioPremiumCredits: 3, // Audio doubles the price
    description: 'BytePlus Seedance 1.5 Pro image-to-video with audio support',
    features: ['Wait 30s', '480p-1080p', 'Audio'],
    maxDuration: 12,
    supportedAspectRatios: [
      'Auto',
      '16:9',
      '4:3',
      '1:1',
      '3:4',
      '9:16',
      '21:9',
    ],
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    supportedResolutions: ['480p', '720p', '1080p'],
    supportsAudio: true,
    estimatedGenerationTime: 30,
    imageCapabilities: {
      maxImages: 2,
      flexibleMode: true,
      labels: ['First Frame', 'Last Frame'],
    },
  },

  // ==================== Seedance 2.0 ====================

  // Seedance 2.0 text-to-video
  'seedance-2.0-text-to-video': {
    id: 'seedance-2.0-text-to-video',
    name: 'Seedance 2.0 Text-to-Video',
    type: VideoModelType.TEXT_TO_VIDEO,
    provider: VideoModelProvider.APIMART,
    volcanoModel: 'seedance-2-0-250215',
    displayName: 'Seedance 2.0',
    perSecondCredits: { '480p': 25, '720p': 45, '1080p': 90 },
    description:
      'BytePlus Seedance 2.0, next-gen video generation with 2K resolution and audio-to-video',
    features: ['Wait 30s', '480p-1080p', 'Audio'],
    maxDuration: 15,
    supportedAspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p', '1080p'],
    supportsAudio: true, // Apimart Seedance audio defaults on; users may turn it off.
    estimatedGenerationTime: 30,
  },

  // Seedance 2.0 image-to-video
  'seedance-2.0-image-to-video': {
    id: 'seedance-2.0-image-to-video',
    name: 'Seedance 2.0 Image-to-Video',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.APIMART,
    volcanoModel: 'seedance-2-0-250215',
    displayName: 'Seedance 2.0',
    perSecondCredits: { '480p': 25, '720p': 45, '1080p': 90 },
    description: 'BytePlus Seedance 2.0 image-to-video with audio support',
    features: ['Wait 30s', '480p-1080p', 'Audio'],
    maxDuration: 15,
    supportedAspectRatios: ['Auto', '16:9', '4:3', '1:1', '3:4', '9:16'],
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p', '1080p'],
    supportsAudio: true, // Apimart Seedance audio defaults on; users may turn it off.
    estimatedGenerationTime: 30,
    imageCapabilities: {
      maxImages: 2,
      flexibleMode: true,
      labels: ['First Frame', 'Last Frame'],
    },
  },

  // ==================== Seedance 2.0 Fast ====================

  // Seedance 2.0 Fast text-to-video
  'seedance-2.0-fast-text-to-video': {
    id: 'seedance-2.0-fast-text-to-video',
    name: 'Seedance 2.0 Fast Text-to-Video',
    type: VideoModelType.TEXT_TO_VIDEO,
    provider: VideoModelProvider.APIMART,
    volcanoModel: 'seedance-2-0-fast-250215',
    displayName: 'Seedance 2.0 Fast',
    perSecondCredits: { '480p': 15, '720p': 30 },
    description:
      'BytePlus Seedance 2.0 Fast, faster video generation with audio support',
    // Fast tier caps at 720p; 1080p is only for standard / standard-face.
    features: ['Wait 30s', '480p-720p', 'Audio', 'Fast'],
    maxDuration: 15,
    supportedAspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p'],
    supportsAudio: true,
    estimatedGenerationTime: 30,
  },

  // Seedance 2.0 Fast image-to-video
  'seedance-2.0-fast-image-to-video': {
    id: 'seedance-2.0-fast-image-to-video',
    name: 'Seedance 2.0 Fast Image-to-Video',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.APIMART,
    volcanoModel: 'seedance-2-0-fast-250215',
    displayName: 'Seedance 2.0 Fast',
    perSecondCredits: { '480p': 15, '720p': 30 },
    description: 'BytePlus Seedance 2.0 Fast image-to-video with audio support',
    // Fast tier caps at 720p; 1080p is only for standard / standard-face.
    features: ['Wait 30s', '480p-720p', 'Audio', 'Fast'],
    maxDuration: 15,
    supportedAspectRatios: ['Auto', '16:9', '4:3', '1:1', '3:4', '9:16'],
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p'],
    supportsAudio: true,
    estimatedGenerationTime: 30,
    imageCapabilities: {
      maxImages: 2,
      flexibleMode: true,
      labels: ['First Frame', 'Last Frame'],
    },
  },

  // ==================== Seedance 2.0 Reference (Face) ====================

  // Seedance 2.0 reference-to-video (doubao-seedance-2.0-face)
  'seedance-2.0-reference-to-video': {
    id: 'seedance-2.0-reference-to-video',
    name: 'Seedance 2.0 Reference-to-Video',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.APIMART,
    volcanoModel: 'seedance-2-0-250215',
    displayName: 'Seedance 2.0',
    perSecondCredits: { '480p': 25, '720p': 45, '1080p': 90 },
    description:
      'BytePlus Seedance 2.0 reference-to-video with reference image, video and audio support',
    features: ['Wait 30s', '480p-1080p', 'Audio', 'Reference'],
    maxDuration: 15,
    supportedAspectRatios: ['Auto', '16:9', '4:3', '1:1', '3:4', '9:16'],
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p', '1080p'],
    supportsAudio: true,
    estimatedGenerationTime: 30,
    generationType: 'REFERENCE_2_VIDEO',
    supportsReferenceMedia: true,
    imageCapabilities: {
      maxImages: 9,
      minImages: 1,
      labels: ['Reference Images'],
    },
  },

  // Seedance 2.0 Fast reference-to-video (doubao-seedance-2.0-fast-face)
  'seedance-2.0-fast-reference-to-video': {
    id: 'seedance-2.0-fast-reference-to-video',
    name: 'Seedance 2.0 Fast Reference-to-Video',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.APIMART,
    volcanoModel: 'seedance-2-0-fast-250215',
    displayName: 'Seedance 2.0 Fast',
    perSecondCredits: { '480p': 15, '720p': 30 },
    description:
      'BytePlus Seedance 2.0 Fast reference-to-video with reference image, video and audio support',
    // Fast variant: 1080p is standard/face only, so fast caps at 720p.
    features: ['Wait 30s', '480p-720p', 'Audio', 'Fast', 'Reference'],
    maxDuration: 15,
    supportedAspectRatios: ['Auto', '16:9', '4:3', '1:1', '3:4', '9:16'],
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p'],
    supportsAudio: true,
    estimatedGenerationTime: 30,
    generationType: 'REFERENCE_2_VIDEO',
    supportsReferenceMedia: true,
    imageCapabilities: {
      maxImages: 9,
      minImages: 1,
      labels: ['Reference Images'],
    },
  },

  // ==================== NSFW Fallback Models (Internal Only) ====================

  // Wan2.2 T2V Plus — NSFW fallback for text-to-video
  'wan22-t2v-plus': {
    id: 'wan22-t2v-plus',
    name: 'Wan2.2 T2V Plus (NSFW Fallback)',
    type: VideoModelType.TEXT_TO_VIDEO,
    provider: VideoModelProvider.ALI,
    aliModel: 'wan2.2-t2v-plus',
    displayName: 'Wan 2.2 Plus',
    perSecondCredits: {
      '480p': 2,
      '1080p': 3,
    },
    description: 'Internal NSFW fallback model for text-to-video',
    maxDuration: 5,
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    supportedDurations: [5],
    supportedResolutions: ['480p', '1080p'],
    supportsAudio: false,
    estimatedGenerationTime: 60,
    supportsNsfw: true,
    isInternalOnly: true,
  },

  // Wan2.6 I2V Flash — NSFW fallback for image-to-video
  'wan26-i2v-flash': {
    id: 'wan26-i2v-flash',
    name: 'Wan2.6 I2V Flash (NSFW Fallback)',
    type: VideoModelType.IMAGE_TO_VIDEO,
    provider: VideoModelProvider.ALI,
    aliModel: 'wan2.6-i2v-flash',
    displayName: 'Wan 2.6 Flash',
    perSecondCredits: {
      '720p': 14,
      '1080p': 20,
    },
    description: 'Internal NSFW fallback model for image-to-video',
    maxDuration: 15,
    supportedAspectRatios: ['Auto', '16:9', '9:16', '1:1'],
    supportedDurations: [5, 10, 15],
    supportedResolutions: ['720p', '1080p'],
    supportsAudio: true,
    estimatedGenerationTime: 120,
    imageCapabilities: {
      maxImages: 2,
      minImages: 1,
      labels: ['First Frame', 'Last Frame'],
      flexibleMode: true,
    },
    supportsNsfw: true,
    isInternalOnly: true,
  },
};

// Helper functions
export function getVideoModel(modelId: string): VideoModelConfig | undefined {
  return VIDEO_MODELS[modelId];
}

export function getVideoModelsByType(type: VideoModelType): VideoModelConfig[] {
  return Object.values(VIDEO_MODELS).filter((model) => model.type === type);
}

export function getTextToVideoModels(): VideoModelConfig[] {
  return getVideoModelsByType(VideoModelType.TEXT_TO_VIDEO);
}

export function getImageToVideoModels(): VideoModelConfig[] {
  return getVideoModelsByType(VideoModelType.IMAGE_TO_VIDEO);
}

export function getKieAiModels(): VideoModelConfig[] {
  return Object.values(VIDEO_MODELS).filter(
    (model) => model.provider === VideoModelProvider.KIEAI
  );
}

// Check if model is a KIE.ai model (Veo3 or Sora)
export function isKieAiModel(modelId: string): boolean {
  const model = getVideoModel(modelId);
  return model?.provider === VideoModelProvider.KIEAI;
}

// Check if model is a KIE Veo3 model
export function isKieAiVeo3Model(modelId: string): boolean {
  const model = getVideoModel(modelId);
  return (
    model?.provider === VideoModelProvider.KIEAI && modelId.includes('veo3')
  );
}

// Check if model is a Sora 2 model
export function isSora2Model(modelId: string): boolean {
  const model = getVideoModel(modelId);
  return (
    model?.provider === VideoModelProvider.KIEAI && modelId.includes('sora')
  );
}

// Check if model is a BytePlus model
export function isBytePlusModel(modelId: string): boolean {
  const model = getVideoModel(modelId);
  return model?.provider === VideoModelProvider.BYTEPLUS;
}

// Check if model is a Volcano model
export function isVolcanoModel(modelId: string): boolean {
  const model = getVideoModel(modelId);
  return model?.provider === VideoModelProvider.VOLCANO;
}

// Check if model is an APICore Veo3 model
export function isApicoreVeo3Model(modelId: string): boolean {
  const model = getVideoModel(modelId);
  return model?.provider === VideoModelProvider.APICORE;
}

// Check if model is an Ali model
export function isAliModel(modelId: string): boolean {
  const model = getVideoModel(modelId);
  return model?.provider === VideoModelProvider.ALI;
}

// Check if model is a Fal model
export function isFalModel(modelId: string): boolean {
  const model = getVideoModel(modelId);
  return model?.provider === VideoModelProvider.FAL;
}

// Check if model is an image-to-video model
export function isImageToVideoModel(modelId: string): boolean {
  const model = getVideoModel(modelId);
  return model?.type === VideoModelType.IMAGE_TO_VIDEO;
}

// Check if model supports audio
export function modelSupportsAudio(modelId: string): boolean {
  const model = getVideoModel(modelId);
  return model?.supportsAudio || false;
}

// Helper function to get per-second credits based on resolution
export function getPerSecondCredits(
  model: VideoModelConfig,
  resolution?: string
): number {
  const pricing = model.perSecondCredits;

  // If it's a simple number, return it directly
  if (typeof pricing === 'number') {
    return pricing;
  }

  // It's resolution-based pricing
  if (resolution) {
    const normalizedRes = resolution.toLowerCase() as keyof ResolutionPricing;
    if (pricing[normalizedRes] !== undefined) {
      return pricing[normalizedRes] as number;
    }
  }

  // Fallback: return the highest price (most expensive resolution) to be safe
  const prices = Object.values(pricing).filter(
    (p): p is number => p !== undefined
  );
  return prices.length > 0 ? Math.max(...prices) : 0;
}

function normalizeGeminiOmniResolution(
  resolution?: string
): GeminiOmniResolution {
  const normalized = resolution?.toLowerCase();
  if (normalized === '720p' || normalized === '1080p' || normalized === '4k') {
    return normalized;
  }
  return '720p';
}

function normalizeGeminiOmniDuration(duration: number): GeminiOmniDuration {
  if (duration === 4 || duration === 6 || duration === 8 || duration === 10) {
    return duration;
  }
  return 8;
}

export function calculateGeminiOmniVideoCredits(
  duration: number,
  resolution?: string,
  hasVideoInput = false
): number {
  const normalizedResolution = normalizeGeminiOmniResolution(resolution);
  if (hasVideoInput) {
    return GEMINI_OMNI_WITH_VIDEO_INPUT_CREDITS[normalizedResolution];
  }

  const normalizedDuration = normalizeGeminiOmniDuration(duration);
  return GEMINI_OMNI_NO_VIDEO_INPUT_CREDITS[normalizedResolution][
    normalizedDuration
  ];
}

// Calculate credits for video generation
export function calculateVideoCredits(
  modelId: string,
  duration: number,
  hasAudio = false,
  resolution?: string,
  hasVideoInput = false
): number {
  const model = getVideoModel(modelId);
  if (!model) return 0;

  if (modelId === 'gemini-omni-video') {
    return calculateGeminiOmniVideoCredits(duration, resolution, hasVideoInput);
  }

  const perSecondCredits = getPerSecondCredits(model, resolution);
  let totalCredits = duration * perSecondCredits;

  // Audio premium (if applicable)
  if (hasAudio && model.audioPremiumCredits) {
    totalCredits += duration * model.audioPremiumCredits;
  }

  return Math.round(totalCredits);
}

// Get supported model IDs
export function getSupportedModelIds(): string[] {
  return Object.keys(VIDEO_MODELS);
}

// Get max images for model
export function getMaxImagesForModel(modelId: string): number {
  const model = getVideoModel(modelId);
  return model?.imageCapabilities?.maxImages ?? 1;
}

// ==================== Frontend to Backend Model ID Mapping ====================

/**
 * Maps frontend simplified model IDs to backend full model IDs
 * Frontend sends: 'veo3', 'sora2', 'wan2.2', etc.
 * Backend needs: 'veo3-text-to-video', 'sora-2-text-to-video', etc.
 */
import { websiteConfig } from '@/config/website';
import type { ExtraMarketingSectionType } from '@/image/config/image-models';

export interface FrontendModelMapping {
  textToVideo: string;
  imageToVideo: string;
  referenceToVideo?: string;
  firstLastFrameToVideo?: string;
  videoEdit?: string;
  extraMarketingSections?: ExtraMarketingSectionType[];
}

const FRONTEND_MODEL_MAPPING: Record<string, FrontendModelMapping> = {
  'veo-3-1': {
    textToVideo: 'veo3-text-to-video',
    imageToVideo: 'veo3-image-to-video',
    referenceToVideo: 'veo3-reference-to-video',
  },
  // Gemini Omni user-facing alias. All surfaced video modes route to the
  // Kie Gemini Omni backend; first/last-frame is intentionally not declared
  // because the upstream API accepts reference images, not end-frame control.
  'gemini-omni': {
    textToVideo: 'gemini-omni-video',
    imageToVideo: 'gemini-omni-video',
    referenceToVideo: 'gemini-omni-video',
    videoEdit: 'gemini-omni-video',
  },
  // Freedom - fewer-restrictions option, wired to the Wan 2.6 backend.
  freedom: {
    textToVideo: 'wan26-text-to-video',
    imageToVideo: 'wan26-image-to-video',
    firstLastFrameToVideo: 'wan22-kf2v',
  },
  sora2: {
    textToVideo: 'sora-2-text-to-video',
    imageToVideo: 'sora-2-image-to-video',
  },
  'sora2-pro': {
    textToVideo: 'sora-2-pro-text-to-video',
    imageToVideo: 'sora-2-pro-image-to-video',
  },
  // Note: Frontend uses hyphens (1-0, 1-5) to avoid Next.js routing issues with dots
  'seedance-1-0-pro': {
    textToVideo: 'seedance-1.0-pro-text-to-video',
    imageToVideo: 'seedance-1.0-pro-image-to-video',
    referenceToVideo: 'seedance-1-0-lite-reference-to-video',
  },
  'seedance-2-0-fast': {
    textToVideo: 'seedance-2.0-fast-text-to-video',
    imageToVideo: 'seedance-2.0-fast-image-to-video',
    referenceToVideo: 'seedance-2.0-fast-reference-to-video',
  },
  'seedance-2-0': {
    textToVideo: 'seedance-2.0-text-to-video',
    imageToVideo: 'seedance-2.0-image-to-video',
    referenceToVideo: 'seedance-2.0-reference-to-video',
    extraMarketingSections: ['twitter-wall'],
  },
  'seedance-1-5-pro': {
    textToVideo: 'seedance-1.5-pro-text-to-video',
    imageToVideo: 'seedance-1.5-pro-image-to-video',
  },
  'wan2-6': {
    textToVideo: 'wan26-text-to-video',
    imageToVideo: 'wan26-image-to-video',
    firstLastFrameToVideo: 'wan22-kf2v',
  },
  // Wan 2.7 reuses the wan2.6 backend for t2v / i2v / first-last-frame
  // (no native 2.7 endpoint for those modes yet) but routes video-edit
  // requests to the real Wan 2.7 video-edit endpoint via wan27-video-edit.
  'wan2-7': {
    textToVideo: 'wan26-text-to-video',
    imageToVideo: 'wan26-image-to-video',
    firstLastFrameToVideo: 'wan22-kf2v',
    referenceToVideo: 'wan27-reference-to-video',
    videoEdit: 'wan27-video-edit',
  },
  // Wan 2.2 only supports text-to-video
  'wan2-2': {
    textToVideo: 'wan22-text-to-video',
    imageToVideo: 'wan22-text-to-video', // No I2V support, fallback to T2V
  },
  // Reference to Video (consistent character) - only supports image input
  'veo3-ref': {
    textToVideo: 'veo3-reference-to-video',
    imageToVideo: 'veo3-reference-to-video',
  },
};

/**
 * Resolve frontend model ID to backend model ID
 * @param frontendModelId - The simplified model ID from frontend (e.g., 'veo3', 'wan2.2')
 * @param hasInputImage - Whether the request includes input images (determines text-to-video vs image-to-video)
 * @param generationType - Optional generation type ('REFERENCE_2_VIDEO' for reference mode, 'FIRST_AND_LAST_FRAMES_2_VIDEO' for first-last-frame mode)
 * @returns The full backend model ID (e.g., 'veo3-text-to-video')
 */
export function resolveBackendModelId(
  frontendModelId: string,
  hasInputImage: boolean,
  generationType?: string
): string {
  // First check if it's already a full backend model ID
  if (VIDEO_MODELS[frontendModelId]) {
    return frontendModelId;
  }

  // Look up in mapping
  const mapping = FRONTEND_MODEL_MAPPING[frontendModelId];
  if (!mapping) {
    throw new Error(`Unknown model: ${frontendModelId}`);
  }

  // Check for reference mode
  if (generationType === 'REFERENCE_2_VIDEO' && mapping.referenceToVideo) {
    return mapping.referenceToVideo;
  }

  // Check for first-and-last-frame mode
  if (
    generationType === 'FIRST_AND_LAST_FRAMES_2_VIDEO' &&
    mapping.firstLastFrameToVideo
  ) {
    return mapping.firstLastFrameToVideo;
  }

  // Video editing — instruction-driven edit of an input video, optionally
  // with reference images. Only wan2-7 ships a backend for this today.
  if (generationType === 'VIDEO_EDIT' && mapping.videoEdit) {
    return mapping.videoEdit;
  }

  return hasInputImage ? mapping.imageToVideo : mapping.textToVideo;
}

/**
 * Check if a model ID is a frontend simplified ID
 */
export function isFrontendModelId(modelId: string): boolean {
  return modelId in FRONTEND_MODEL_MAPPING;
}

/**
 * Get all supported frontend model IDs
 */
export function getSupportedFrontendModelIds(): string[] {
  return Object.keys(FRONTEND_MODEL_MAPPING);
}

// ============================================
// Frontend UI Helper Types and Functions
// ============================================

export interface VideoModelOption {
  value: string;
  label: string;
  icon?: string;
  logo?: string;
  /** Emoji glyph shown in place of a logo image. */
  emoji?: string;
  /** Short secondary label shown in compact model pickers. */
  tagline?: string;
  /** If true, this model has no dedicated marketing page (uses a parent model's page instead) */
  noMarketingPage?: boolean;
  /** If true, render as a disabled "Coming soon" entry in pickers. */
  comingSoon?: boolean;
}

/**
 * Video model options for the Select component in AIWorkspace
 * Maps frontend model IDs to display labels and logos
 */
const VIDEO_MODEL_OPTIONS: VideoModelOption[] = [
  {
    value: 'freedom',
    label: 'Freedom',
    emoji: '🔥',
    tagline: 'More creative freedom, fewer restrictions',
  },
  {
    value: 'gemini-omni',
    label: 'Gemini Omni',
    logo: '/icons/models/veo3.svg',
    noMarketingPage: true,
  },
  {
    value: 'veo-3-1',
    label: 'Google Veo 3.1',
    logo: '/icons/models/nano-banana.svg',
  },
  { value: 'sora2', label: 'Sora 2', logo: '/icons/models/sora.svg' },
  { value: 'sora2-pro', label: 'Sora 2 Pro', logo: '/icons/models/sora.svg' },
  {
    value: 'seedance-2-0-fast',
    label: 'Seedance 2.0 Fast',
    logo: '/icons/models/seedance.png',
    noMarketingPage: true,
  },
  {
    value: 'seedance-2-0',
    label: 'Seedance 2.0',
    logo: '/icons/models/seedance.png',
  },
  {
    value: 'seedance-1-5-pro',
    label: 'Seedance 1.5 Pro',
    logo: '/icons/models/seedance.png',
  },
  {
    value: 'seedance-1-0-pro',
    label: 'Seedance 1.0 Pro',
    logo: '/icons/models/seedance.png',
  },
  { value: 'wan2-7', label: 'Wan 2.7', logo: '/icons/models/wan.svg' },
  { value: 'wan2-6', label: 'Wan 2.6', logo: '/icons/models/wan.svg' },
  { value: 'wan2-2', label: 'Wan 2.2', logo: '/icons/models/wan.svg' },
];

/**
 * Surface allow-list for user-paid video contexts (home hero +
 * dashboard). Source of truth: `videoSurfaces['user-paid'].allowedModels`
 * in `website.tsx`. Picker UIs filter against this so the visible
 * options can never include a model the backend would 403 on.
 */
function isAllowedOnUserPaidSurface(modelId: string): boolean {
  return websiteConfig.generation.videoSurfaces[
    'user-paid'
  ].allowedModels.includes(modelId);
}

// Coming-soon options bypass the surface allow-list because they're
// rendered as disabled placeholders and never reach the backend.
function isVisibleInPicker(option: VideoModelOption): boolean {
  return option.comingSoon === true || isAllowedOnUserPaidSurface(option.value);
}

// Per-tab visibility overrides for the home hero picker. Keep the
// underlying surface allow-list intact — these just narrow what shows
// up in each tab's dropdown.
const TEXT_TO_VIDEO_VISIBLE = new Set([
  'freedom',
  'gemini-omni',
  'seedance-2-0',
  'seedance-2-0-fast',
]);
const IMAGE_TO_VIDEO_VISIBLE = new Set([
  'freedom',
  'seedance-2-0',
  'seedance-2-0-fast',
]);
const REFERENCE_TO_VIDEO_VISIBLE = new Set([
  'gemini-omni',
  'seedance-2-0',
  'seedance-2-0-fast',
  'wan2-7',
]);

/**
 * Get video model options for Select component
 */
export function getVideoModelOptions(): VideoModelOption[] {
  return VIDEO_MODEL_OPTIONS.filter(
    (option) =>
      isVisibleInPicker(option) && TEXT_TO_VIDEO_VISIBLE.has(option.value)
  );
}

/**
 * Get video model options that support reference-to-video mode
 * Only returns models that have referenceToVideo mapping configured
 */
export function getVideoModelOptionsForReference(): VideoModelOption[] {
  return VIDEO_MODEL_OPTIONS.filter((option) => {
    if (!isAllowedOnUserPaidSurface(option.value)) return false;
    if (!REFERENCE_TO_VIDEO_VISIBLE.has(option.value)) return false;
    const mapping = FRONTEND_MODEL_MAPPING[option.value];
    return mapping?.referenceToVideo !== undefined;
  });
}

/**
 * Get video model options for the video-edit tab. Includes any model that
 * declares a real `videoEdit` backend (today: wan2-7) plus `gemini-omni`
 * as the marketing-default entry — Gemini Omni has no edit backend yet,
 * so selecting it still triggers the "coming soon" placeholder, but it
 * stays visible so the picker shows the brand alongside Wan 2.7.
 *
 * Gemini Omni is listed first so it becomes the default when the user
 * switches into the edit tab with an incompatible current selection.
 */
export function getVideoModelOptionsForEdit(): VideoModelOption[] {
  const out: VideoModelOption[] = [];
  const geminiOmni = VIDEO_MODEL_OPTIONS.find((o) => o.value === 'gemini-omni');
  if (geminiOmni && isAllowedOnUserPaidSurface(geminiOmni.value)) {
    out.push(geminiOmni);
  }
  for (const option of VIDEO_MODEL_OPTIONS) {
    if (option.value === 'gemini-omni') continue;
    if (!isAllowedOnUserPaidSurface(option.value)) continue;
    const mapping = FRONTEND_MODEL_MAPPING[option.value];
    if (mapping?.videoEdit !== undefined) out.push(option);
  }
  return out;
}

/**
 * Get video model options that support image-to-video mode
 * Filters out models that only support text-to-video (like Wan 2.2)
 */
export function getVideoModelOptionsForImageToVideo(): VideoModelOption[] {
  return VIDEO_MODEL_OPTIONS.filter((option) => {
    if (!isVisibleInPicker(option)) return false;
    if (!IMAGE_TO_VIDEO_VISIBLE.has(option.value)) return false;
    if (option.comingSoon) return true;
    const mapping = FRONTEND_MODEL_MAPPING[option.value];
    if (!mapping) return false;
    // Check if imageToVideo points to a real I2V model (not same as T2V)
    const i2vModel = VIDEO_MODELS[mapping.imageToVideo];
    return i2vModel && i2vModel.type === VideoModelType.IMAGE_TO_VIDEO;
  });
}

/**
 * Get display label for a video model
 */
export function getVideoModelLabel(modelId: string): string | undefined {
  return VIDEO_MODEL_OPTIONS.find((m) => m.value === modelId)?.label;
}

/**
 * Get video model options that have dedicated marketing pages
 * Excludes models with noMarketingPage flag (e.g., seedance-2-0-fast uses seedance-2-0's page)
 */
export function getVideoModelPageOptions(): VideoModelOption[] {
  return VIDEO_MODEL_OPTIONS.filter((m) => !m.noMarketingPage);
}

/**
 * Check if a model ID is a valid frontend video model
 */
export function isValidVideoModel(modelId: string): boolean {
  return VIDEO_MODEL_OPTIONS.some((m) => m.value === modelId);
}

/**
 * Check if a model ID has a dedicated marketing page
 */
export function isValidVideoModelPage(modelId: string): boolean {
  return VIDEO_MODEL_OPTIONS.some(
    (m) => m.value === modelId && !m.noMarketingPage
  );
}

/**
 * Get video model config from frontend model ID
 * @param frontendModelId - The simplified model ID from frontend
 * @param isImageInput - Whether the current mode is image-to-video
 * Returns the appropriate model config based on mode
 */
export function getVideoModelConfig(
  frontendModelId: string,
  isImageInput = false,
  generationType?: string
): VideoModelConfig | undefined {
  if (VIDEO_MODELS[frontendModelId]) {
    return VIDEO_MODELS[frontendModelId];
  }

  const mapping = FRONTEND_MODEL_MAPPING[frontendModelId];
  if (!mapping) return undefined;

  if (generationType === 'REFERENCE_2_VIDEO' && mapping.referenceToVideo) {
    return VIDEO_MODELS[mapping.referenceToVideo];
  }

  if (
    generationType === 'FIRST_AND_LAST_FRAMES_2_VIDEO' &&
    mapping.firstLastFrameToVideo
  ) {
    return VIDEO_MODELS[mapping.firstLastFrameToVideo];
  }

  if (generationType === 'VIDEO_EDIT' && mapping.videoEdit) {
    return VIDEO_MODELS[mapping.videoEdit];
  }

  return VIDEO_MODELS[
    isImageInput ? mapping.imageToVideo : mapping.textToVideo
  ];
}

/**
 * Resolve the backend reference-to-video config for a frontend model id.
 * Used by panels that need reference-specific caps such as max images or
 * Seedance 2.0 face video/audio reference support.
 */
export function getReferenceVideoModelConfig(
  frontendModelId: string
): VideoModelConfig | undefined {
  return getVideoModelConfig(frontendModelId, true, 'REFERENCE_2_VIDEO');
}

/**
 * Get extra marketing sections for a frontend video model ID
 */
export function getVideoModelExtraSections(
  frontendModelId: string
): ExtraMarketingSectionType[] {
  const mapping = FRONTEND_MODEL_MAPPING[frontendModelId];
  return mapping?.extraMarketingSections ?? [];
}

/**
 * When entering a model-specific page, optionally override which dropdown model is selected
 */
const PAGE_DEFAULT_MODEL_OVERRIDE: Record<string, string> = {
  'seedance-2-0': 'seedance-2-0-fast',
};

/**
 * Get the default dropdown model for a page model ID
 * e.g., '/video/seedance-2-0' page defaults to 'seedance-2-0-fast' in the dropdown
 */
export function getPageDefaultModel(pageModelId: string): string {
  return PAGE_DEFAULT_MODEL_OVERRIDE[pageModelId] || pageModelId;
}

/**
 * Default video model for the workspace + home video hero. Pulled from
 * the user-paid video surface so changing the default is a one-line
 * config edit in `website.tsx`.
 */
export const DEFAULT_VIDEO_MODEL =
  websiteConfig.generation.videoSurfaces['user-paid'].defaultModel;

/**
 * Frontend model id → resolutions that require a paid subscription.
 * Free users see a crown badge on these and clicking opens the
 * upgrade dialog. Strings must match the values in each model's
 * `supportedResolutions` exactly.
 */
export const PREMIUM_VIDEO_RESOLUTIONS_BY_MODEL: Record<string, string[]> = {
  'gemini-omni': ['4k'],
  'seedance-2-0': ['1080p'],
};

/**
 * Locked resolutions for a frontend video model, given the user's
 * subscription state. Empty array if the user is subscribed or the
 * model has no premium tier.
 */
export function getLockedVideoResolutions(
  frontendModelId: string,
  isSubscribed: boolean
): string[] {
  if (isSubscribed) return [];
  return PREMIUM_VIDEO_RESOLUTIONS_BY_MODEL[frontendModelId] || [];
}
