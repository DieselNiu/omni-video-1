export interface NsfwDetectionInput {
  prompt?: string;
  imageUrls?: string[];
}

export interface NsfwDetectionResult {
  flagged: boolean;
  categories: string[];
  scores: Record<string, number>;
}

export interface NsfwRoutingDecision {
  action: 'pass' | 'fallback' | 'block';
  fallbackModelId?: string;
  fallbackCredits?: number;
  originalModelId: string;
  mappedParams?: Record<string, unknown>;
}
