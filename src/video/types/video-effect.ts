/**
 * Video effect types for PixVerse and similar services
 */

export interface EffectContent {
  seo?: {
    title?: string;
    description?: string;
  };
  howToUse?: {
    steps: Array<{
      number: number;
      title: string;
      description: string;
    }>;
  };
  technicalSpecs?: {
    effectDetails?: Record<string, string>;
    outputSpecs?: Record<string, string>;
  };
  tips?: Array<{
    title: string;
    description: string;
  }>;
  faq?: Array<{
    question: string;
    answer: string;
  }>;
  cta?: {
    title?: string;
    buttonText?: string;
  };
}

export interface VideoEffect {
  id: string;
  slug: string;
  locale: string;
  title: string;
  pageTitle: string | null;
  pageDescription: string | null;
  content: EffectContent | null;
  previewImage: string | null;
  previewVideo: string | null;
  previewThumbnail: string | null;
  previewGif: string | null;
  parameters: Record<string, unknown> | null;
  promptTemplate: string | null;
  creditsRequired: number;
  status: 'created' | 'online' | 'offline' | 'deleted';
  isHot: boolean;
  category: string | null;
  displayOrder: number;
  effectType: 'hailuo_prompt' | 'pixverse_template';
  pixverseTemplateId: number | null;
  maxImages: number;
  createdAt: string;
  updatedAt: string;
}

export enum VideoEffectStatus {
  Created = 'created',
  Deleted = 'deleted',
  Online = 'online',
  Offline = 'offline',
}

// PixVerse API types
export interface PixVerseUploadResponse {
  ErrCode: number;
  ErrMsg: string;
  Resp?: {
    img_id: number;
    img_url: string;
  };
}

export interface PixVerseGenerateResponse {
  ErrCode: number;
  ErrMsg: string;
  Resp?: {
    video_id: number;
  };
}

export interface PixVerseStatusResponse {
  ErrCode: number;
  ErrMsg: string;
  Resp?: {
    video_id: number;
    status: number; // 1=completed, 5=processing, 6=deleted, 7=moderation_failed, 8=failed
    url?: string;
    cover_url?: string;
    duration?: number;
  };
}

// PixVerse status codes
export enum PixVerseStatus {
  Completed = 1,
  Processing = 5,
  Deleted = 6,
  ModerationFailed = 7,
  Failed = 8,
}
