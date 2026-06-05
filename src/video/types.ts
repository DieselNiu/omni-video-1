// Video generation provider interface types

export interface VideoGenerationRequest {
  model: string;
  prompt: string;
  image_url?: string; // backward compatibility
  image_urls?: string[]; // supports 1-4 images (first frame, last frame, or references)
  /** Input video URL for video-edit / video-to-video models (e.g. wan2.7-videoedit). */
  video_url?: string;
  image_roles?: ('first_frame' | 'last_frame' | 'reference_image')[]; // role for each image in image_urls
  video_urls?: string[]; // reference videos (Seedance 2.0 face reference mode)
  audio_urls?: string[]; // reference audio (Seedance 2.0 face reference mode)
  audio_ids?: string[]; // Gemini Omni audio ids from gemini-omni-audio
  character_ids?: string[]; // Gemini Omni character ids
  return_last_frame?: boolean; // Seedance 2.0: also return the video's last frame image
  negative_prompt?: string;
  aspect_ratio?: string;
  aspectRatio?: string; // alias for aspect_ratio
  duration?: number | string;
  resolution?: string; // '720p' or '1080p'
  cfg_scale?: number;
  seed?: number;
  generate_audio?: boolean;
  enable_prompt_enhancement?: boolean;
  generationType?: string; // e.g., REFERENCE_2_VIDEO
  watermarkEnabled?: boolean;
  // Wan 2.6 specific parameters
  audio?: boolean; // Deprecated: Wan 2.5+ auto-generates audio
  prompt_extend?: boolean; // Enable prompt expansion
  shot_type?: 'single' | 'multi'; // Shot type for video
  // Seedance specific parameters
  camera_fixed?: boolean; // Whether camera is fixed (default: false for dynamic camera)
  // Seedance 2.0 multimodal reference inputs (BytePlus Ark)
  referenceVideos?: string[];
  referenceAudios?: string[];
  [key: string]: unknown;
}

export interface VideoGenerationResponse {
  request_id: string;
  status: string;
  model: string;
  task_id?: string;
  raw_response?: unknown;
  [key: string]: unknown;
}

export interface VideoGenerationStatus {
  request_id: string;
  status: string; // "IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED"
  logs?: unknown[];
  metrics?: unknown;
  error?: string;
  error_message?: string;
  progress?: number;
  queue_position?: number;
  raw_data?: unknown;
  model?: string;
  [key: string]: unknown;
}

export interface VideoGenerationResult {
  request_id: string;
  status: string;
  video_url?: string | null;
  last_frame_url?: string | null; // Seedance return_last_frame: last frame image URL
  hd_video_url?: string; // 1080P high-definition video URL
  hd_processing?: boolean; // Whether 1080P version is still processing
  hd_available?: boolean; // Whether 1080P version is available
  data?: unknown;
  model?: string;
  error_message?: string;
  [key: string]: unknown;
}

export interface VideoProvider {
  // Submit a video generation request
  submit(
    model: string,
    input: VideoGenerationRequest,
    webhookUrl?: string
  ): Promise<VideoGenerationResponse>;

  // Check the status of a video generation request
  status(model: string, requestId: string): Promise<VideoGenerationStatus>;

  // Get the result of a completed video generation request
  result(model: string, requestId: string): Promise<VideoGenerationResult>;

  // Get provider name
  getName(): string;
}

// Video generation status enum
export enum VideoGenerationStatusEnum {
  PENDING = 'PENDING',
  IN_QUEUE = 'IN_QUEUE',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  SAVED_TO_R2 = 'SAVED_TO_R2',
  FAILED = 'FAILED',
}
