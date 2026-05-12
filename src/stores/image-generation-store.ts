import { create } from 'zustand';

export type GenerationStatus =
  | 'idle'
  | 'submitting'
  | 'polling'
  | 'completed'
  | 'failed';

export type MediaType = 'image' | 'video';

interface ActiveGeneration {
  id: string;
  taskId: string;
  status: string;
  progress?: number;
  imageUrls?: string[];
  videoUrl?: string;
  mediaType?: MediaType;
  errorMessage?: string;
  aspectRatio?: string;
  modelId?: string;
  startTime: number;
}

// Inline SubmitResponse to avoid importing from client hook
export interface SubmitResponse {
  success: boolean;
  id: string;
  taskId: string;
  status: string;
  creditsUsed: number;
  imageUrl?: string;
  error?: string;
}

// Extended status response that includes all fields used by the store
export interface ExtendedStatusResponse {
  success: boolean;
  id: string;
  status: string;
  imageUrls?: string[];
  imageUrlsR2?: string[];
  errorMessage?: string;
  error?: string;
  videoUrl?: string;
  mediaType?: MediaType;
  progress?: number;
}

interface ImageGenerationState {
  // Current generation state
  status: GenerationStatus;
  activeGeneration: ActiveGeneration | null;
  error: string | null;

  // Actions
  setSubmitting: () => void;
  setPolling: (
    response: SubmitResponse,
    mediaType?: MediaType,
    aspectRatio?: string,
    modelId?: string
  ) => void;
  updateStatus: (status: ExtendedStatusResponse) => void;
  setCompleted: (status: ExtendedStatusResponse) => void;
  setFailed: (error: string) => void;
  reset: () => void;
}

export const useImageGenerationStore = create<ImageGenerationState>((set) => ({
  // Initial state
  status: 'idle',
  activeGeneration: null,
  error: null,

  // Actions
  setSubmitting: () =>
    set({
      status: 'submitting',
      activeGeneration: null,
      error: null,
    }),

  setPolling: (
    response: SubmitResponse,
    mediaType?: MediaType,
    aspectRatio?: string,
    modelId?: string
  ) =>
    set({
      status: 'polling',
      activeGeneration: {
        id: response.id,
        taskId: response.taskId,
        status: response.status,
        mediaType: mediaType || 'image',
        aspectRatio,
        modelId,
        startTime: Date.now(),
      },
      error: null,
    }),

  updateStatus: (status: ExtendedStatusResponse) =>
    set((state) => ({
      activeGeneration: state.activeGeneration
        ? {
            ...state.activeGeneration,
            status: status.status,
            progress: status.progress ?? state.activeGeneration.progress,
            // Prefer R2 URLs (permanent storage) over original URLs (may expire)
            imageUrls: status.imageUrlsR2?.length
              ? status.imageUrlsR2
              : status.imageUrls,
            videoUrl: status.videoUrl,
            mediaType: status.mediaType || state.activeGeneration.mediaType,
            errorMessage: status.errorMessage,
          }
        : null,
    })),

  setCompleted: (status: ExtendedStatusResponse) =>
    set((state) => ({
      status: 'completed',
      activeGeneration: state.activeGeneration
        ? {
            ...state.activeGeneration,
            status: status.status,
            // Prefer R2 URLs (permanent storage) over original URLs (may expire)
            imageUrls: status.imageUrlsR2?.length
              ? status.imageUrlsR2
              : status.imageUrls,
            videoUrl: status.videoUrl,
            mediaType: status.mediaType || state.activeGeneration.mediaType,
          }
        : {
            // Handle synchronous providers (like Flow) that complete immediately
            // without going through setPolling first
            id: status.id,
            taskId: status.id,
            status: status.status,
            imageUrls: status.imageUrlsR2?.length
              ? status.imageUrlsR2
              : status.imageUrls,
            videoUrl: status.videoUrl,
            mediaType: status.mediaType || 'image',
            startTime: Date.now(),
          },
      error: null,
    })),

  setFailed: (error: string) =>
    set((state) => ({
      status: 'failed',
      activeGeneration: state.activeGeneration
        ? {
            ...state.activeGeneration,
            errorMessage: error,
          }
        : null,
      error,
    })),

  reset: () =>
    set({
      status: 'idle',
      activeGeneration: null,
      error: null,
    }),
}));
