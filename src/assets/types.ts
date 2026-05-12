export type AssetType = 'image' | 'video' | 'audio' | 'other';

export type AssetStatus =
  | 'PENDING'
  | 'IN_QUEUE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'SAVED_TO_R2'
  | 'FAILED';

export type AssetSort = 'latest' | 'oldest';

export interface Asset {
  id: string;
  userId: string;
  type: AssetType;
  status: AssetStatus;
  title: string | null;
  prompt: string | null;
  optimizedPrompt: string | null;
  negativePrompt: string | null;
  modelId: string | null;
  channel: string | null;
  mode: string | null;
  outputFormat: string | null;
  aspectRatio: string | null;
  resolution: string | null;
  durationSeconds: number | null;
  hasAudio: boolean | null;
  effectId: string | null;
  inputImageUrls: string[] | null;
  inputImageRoles: string[] | null;
  outputImageUrls: string[] | null;
  outputImageUrlsR2: string[] | null;
  outputVideoUrl: string | null;
  outputVideoUrlR2: string | null;
  thumbnailUrl: string | null;
  providerRequestId: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  // Internal-only: ExecutableModel-level fields (upstreamBackend,
  // channelDecision, provider names). NEVER serialize to client.
  executionMetadata: Record<string, unknown> | null;
  logs: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  creditsUsed: number | null;
  isFavorite: boolean;
  isDelete: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginationMeta {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

export interface AssetsResponse {
  success: boolean;
  assets: Asset[];
  pagination: PaginationMeta;
}
