import type { UploadedImage } from '@/components/app/image-upload-area';
import {
  DEFAULT_IMAGE_MODEL,
  getDefaultImageResolution,
  getImageModel,
} from '@/image/config/image-models';
import {
  DEFAULT_VIDEO_MODEL,
  getVideoModelConfig,
} from '@/video/config/video-models';
import { create } from 'zustand';

/**
 * Single source of truth for the generate form state across `/app` surfaces
 * (the left operation panel, the floating bar collapsed/expanded variants).
 *
 * Why a store and not local component state:
 * - Each surface used to keep its own copy → adding a parameter meant editing
 *   3+ files. Worse, switching between left panel and floating bar lost the
 *   in-progress prompt because the two components didn't share anything.
 * - With this store, all surfaces read/write the same state. Switching
 *   surfaces preserves what the user typed and selected.
 *
 * Slice layout: image and video each get their own settings slice. They
 * coexist intentionally — picking a video model in the panel does NOT
 * clobber the image model the user picked earlier, and vice versa. Only
 * `prompt` is shared (the same idea often makes sense for both image and
 * video, and it's the most painful thing to lose).
 *
 * Uploaded inputs (img2img source images, img2vid first frames) also live
 * here so the floating bar can respect img2X panel modes — it needs to
 * read the uploaded URLs to send them to the API and know whether to
 * enable its Generate button. Each mode has its own slot so switching
 * between img2img and img2vid doesn't clobber the other's upload.
 */

export interface ImageFormState {
  selectedModel: string;
  aspectRatio: string;
  resolution: string; // Pro-model only; ignored for non-Pro
}

export interface VideoFormState {
  selectedModel: string;
  aspectRatio: string;
  duration: string;
  resolution: string;
  generateAudio: boolean;
}

interface GenerateFormState {
  prompt: string;
  image: ImageFormState;
  video: VideoFormState;

  // Uploaded inputs (shared across panel + floating bar)
  img2imgInputs: UploadedImage[];
  img2vidFirstFrameInputs: UploadedImage[];
  img2vidLastFrameInputs: UploadedImage[];

  // Prompt
  setPrompt: (prompt: string) => void;

  // Upload setters
  setImg2imgInputs: (images: UploadedImage[]) => void;
  setImg2vidFirstFrameInputs: (images: UploadedImage[]) => void;
  setImg2vidLastFrameInputs: (images: UploadedImage[]) => void;

  // Image setters
  setImageAspectRatio: (value: string) => void;
  setImageResolution: (value: string) => void;
  /**
   * Smart image-model setter. Resets aspect ratio to the new model's first
   * supported option if the current one isn't valid for it. Surfaces should
   * always go through this instead of mutating `image.selectedModel` directly.
   */
  setImageModel: (modelId: string) => void;

  // Video setters
  setVideoAspectRatio: (value: string) => void;
  setVideoDuration: (value: string) => void;
  setVideoResolution: (value: string) => void;
  setVideoGenerateAudio: (value: boolean) => void;
  /**
   * Smart video-model setter. Resets duration / resolution / aspect ratio
   * to the new model's first supported option for each unsupported value.
   * `isImageInput` matters because the same frontend model id can map to
   * different backend configs for text-to-video vs image-to-video.
   */
  setVideoModel: (
    modelId: string,
    isImageInput?: boolean,
    generationType?: string
  ) => void;
}

const FALLBACK_VIDEO_DURATIONS = [5, 10, 15];
const FALLBACK_VIDEO_RESOLUTIONS = ['720p', '1080p'];
const FALLBACK_VIDEO_ASPECTS = ['Auto', '16:9', '9:16'];
const FALLBACK_IMAGE_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4'];

// Pick sane defaults from the default model's actual supported options
// at module load. Avoids hardcoding values that drift from the model config.
function defaultImageState(): ImageFormState {
  const config = getImageModel(DEFAULT_IMAGE_MODEL);
  const aspect = config?.supportedAspectRatios?.[0] ?? '1:1';
  return {
    selectedModel: DEFAULT_IMAGE_MODEL,
    aspectRatio: aspect,
    resolution: getDefaultImageResolution(DEFAULT_IMAGE_MODEL) ?? '1K',
  };
}

function defaultVideoState(): VideoFormState {
  const config = getVideoModelConfig(DEFAULT_VIDEO_MODEL, false);
  const duration = config?.supportedDurations?.[0] ?? 5;
  const resolution = config?.supportedResolutions?.[0] ?? '1080p';
  const aspect = config?.supportedAspectRatios?.[0] ?? 'Auto';
  return {
    selectedModel: DEFAULT_VIDEO_MODEL,
    aspectRatio: aspect,
    duration: String(duration),
    resolution,
    generateAudio: true,
  };
}

export const useGenerateFormStore = create<GenerateFormState>((set) => ({
  prompt: '',
  image: defaultImageState(),
  video: defaultVideoState(),
  img2imgInputs: [],
  img2vidFirstFrameInputs: [],
  img2vidLastFrameInputs: [],

  setPrompt: (prompt) => set({ prompt }),

  setImg2imgInputs: (images) => set({ img2imgInputs: images }),
  setImg2vidFirstFrameInputs: (images) =>
    set({ img2vidFirstFrameInputs: images }),
  setImg2vidLastFrameInputs: (images) =>
    set({ img2vidLastFrameInputs: images }),

  setImageAspectRatio: (value) =>
    set((state) => ({ image: { ...state.image, aspectRatio: value } })),
  setImageResolution: (value) =>
    set((state) => ({ image: { ...state.image, resolution: value } })),

  setImageModel: (modelId) =>
    set((state) => {
      const config = getImageModel(modelId);
      const supported = config?.supportedAspectRatios ?? FALLBACK_IMAGE_ASPECTS;
      const nextAspect = supported.includes(state.image.aspectRatio)
        ? state.image.aspectRatio
        : (supported[0] ?? '1:1');
      return {
        image: {
          ...state.image,
          selectedModel: modelId,
          aspectRatio: nextAspect,
          resolution:
            getDefaultImageResolution(modelId) ?? state.image.resolution,
        },
      };
    }),

  setVideoAspectRatio: (value) =>
    set((state) => ({ video: { ...state.video, aspectRatio: value } })),
  setVideoDuration: (value) =>
    set((state) => ({ video: { ...state.video, duration: value } })),
  setVideoResolution: (value) =>
    set((state) => ({ video: { ...state.video, resolution: value } })),
  setVideoGenerateAudio: (value) =>
    set((state) => ({ video: { ...state.video, generateAudio: value } })),

  setVideoModel: (modelId, isImageInput, generationType) =>
    set((state) => {
      const inputMode = isImageInput ?? false;
      const config = getVideoModelConfig(modelId, inputMode, generationType);
      const durations = config?.supportedDurations ?? FALLBACK_VIDEO_DURATIONS;
      const resolutions =
        config?.supportedResolutions ?? FALLBACK_VIDEO_RESOLUTIONS;
      const aspects = config?.supportedAspectRatios ?? FALLBACK_VIDEO_ASPECTS;

      const currentDurationNum = Number(state.video.duration);
      const nextDuration = durations.includes(currentDurationNum)
        ? state.video.duration
        : String(durations[0] ?? 5);
      const nextResolution = resolutions.includes(state.video.resolution)
        ? state.video.resolution
        : (resolutions[0] ?? '1080p');
      const nextAspect = aspects.includes(state.video.aspectRatio)
        ? state.video.aspectRatio
        : (aspects[0] ?? 'Auto');

      // If the new model doesn't support flexibleMode (first+last frame),
      // drop any stored last-frame uploads — the UI hides the second tile
      // anyway, and we don't want stale data leaking into the next submit.
      const supportsFlexible = config?.imageCapabilities?.flexibleMode === true;

      return {
        video: {
          ...state.video,
          selectedModel: modelId,
          duration: nextDuration,
          resolution: nextResolution,
          aspectRatio: nextAspect,
        },
        ...(supportsFlexible ? {} : { img2vidLastFrameInputs: [] }),
      };
    }),
}));
