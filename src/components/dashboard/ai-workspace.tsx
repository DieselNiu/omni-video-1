'use client';

import { NsfwUpgradeDialog } from '@/components/pricing/nsfw-upgrade-dialog';
import {
  type FloatingBarAspectRatioOption,
  type FloatingBarModelOption,
  FloatingGenerateBar,
} from '@/components/shared/floating-generate-bar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreditsCheck } from '@/hooks/use-credits-check';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useImageGeneration } from '@/hooks/use-image-generation';
import { useToast } from '@/hooks/use-toast';
import { useVideoGeneration } from '@/hooks/use-video-generation';
import { useLocaleRouter } from '@/i18n/navigation';
import {
  DEFAULT_IMAGE_MODEL,
  calculateImageCredits,
  getImageModel,
  getImageModelOptionsByMode,
  getResolutionOptions,
  isProModel,
  isValidImageModel,
} from '@/image/config/image-models';
import { cn } from '@/lib/utils';
import { useAppPageStore } from '@/stores/app-page-store';
import { useImageGenerationStore } from '@/stores/image-generation-store';
import {
  DEFAULT_VIDEO_MODEL,
  VIDEO_MODELS,
  calculateVideoCredits,
  getPageDefaultModel,
  getVideoModelConfig,
  getVideoModelOptions,
  getVideoModelOptionsForReference,
  isValidVideoModel,
  resolveBackendModelId,
} from '@/video/config/video-models';

/** Frontend model ID for Wan 2.6 - used as the fallback recommendation */
const WAN26_MODEL_ID = 'wan2-6';

import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UploadedImage } from '../app/image-upload-area';
import { FloatingCollapsedBar } from '../shared/floating-collapsed-bar';
import { ImageGallery } from './gallery';

const LoginModal = dynamic(
  () =>
    import('@/components/auth/login-modal').then((mod) => ({
      default: mod.LoginModal,
    })),
  {
    ssr: false,
  }
);

export type WorkspaceMode =
  | 'text-to-image'
  | 'image-to-image'
  | 'text-to-video'
  | 'image-to-video';

export type MediaType = 'image' | 'video';

interface AIWorkspaceProps {
  initialMediaType: MediaType;
  initialModel?: string;
  variant?: 'default' | 'glass';
}

// Aspect ratio options with visual icons
const ASPECT_RATIOS: {
  value: string;
  iconClass: string;
}[] = [
  { value: '1:1', iconClass: 'flex size-4 border border-current' },
  { value: '16:9', iconClass: 'flex h-2.5 w-4 border border-current' },
  { value: '9:16', iconClass: 'flex h-4 w-2.5 border border-current' },
  { value: '4:3', iconClass: 'flex h-3 w-4 border border-current' },
  { value: '3:4', iconClass: 'flex h-4 w-3 border border-current' },
];

// Video aspect ratio options
const VIDEO_ASPECT_RATIOS: {
  value: string;
  label: string;
  iconClass: string;
}[] = [
  {
    value: 'Auto',
    label: 'Auto',
    iconClass: 'flex size-3 border border-current rounded-[2px]',
  },
  {
    value: '16:9',
    label: 'Landscape (16:9)',
    iconClass: 'flex h-2.5 w-4 border border-current rounded-[2px]',
  },
  {
    value: '9:16',
    label: 'Portrait (9:16)',
    iconClass: 'flex h-4 w-2.5 border border-current rounded-[2px]',
  },
  {
    value: '1:1',
    label: 'Square (1:1)',
    iconClass: 'flex size-3 border border-current rounded-[2px]',
  },
  {
    value: '4:3',
    label: 'Standard (4:3)',
    iconClass: 'flex h-3 w-4 border border-current rounded-[2px]',
  },
  {
    value: '3:4',
    label: 'Portrait (3:4)',
    iconClass: 'flex h-4 w-3 border border-current rounded-[2px]',
  },
  {
    value: '21:9',
    label: 'Ultra-wide (21:9)',
    iconClass: 'flex h-2 w-5 border border-current rounded-[2px]',
  },
];

// Resolution options from centralized config
const RESOLUTIONS = getResolutionOptions();

// Max source images for image-to-image (e.g. Nano Banana / Gemini 2.0 Flash
// accept multiple reference images)
const MAX_IMG2IMG_INPUTS = 5;

export function AIWorkspace({
  initialMediaType,
  initialModel,
  variant = 'default',
}: AIWorkspaceProps) {
  // Internal mediaType state — top-left icons toggle this purely visually,
  // without changing the URL. Initial value comes from the page slug.
  const [mediaType, setMediaType] = useState<MediaType>(initialMediaType);
  const isGlass = variant === 'glass';
  const t = useTranslations('AIWorkspace');
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const currentUser = useCurrentUser();
  const [nsfwDialogState, setNsfwDialogState] = useState<
    'blocked' | 'moderation' | null
  >(null);
  const { checkCredits, isLoading: isCreditsLoading } = useCreditsCheck();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const router = useLocaleRouter();

  // Initial values from URL query params (SSR-safe).
  // Prompt is in sessionStorage (too long for URL); everything else in URL params.
  const initialPrompt = useMemo(() => {
    if (isGlass) return '';
    const urlPrompt = searchParams.get('prompt') || '';
    if (urlPrompt) return urlPrompt;
    try {
      const storedPrompt = sessionStorage.getItem('heroWorkspacePrompt');
      if (storedPrompt) {
        sessionStorage.removeItem('heroWorkspacePrompt');
        return storedPrompt;
      }
    } catch {
      // sessionStorage unavailable
    }
    return '';
  }, [isGlass, searchParams]);
  const initialInputImages = searchParams.get('inputImages');
  const initialFirstFrame = searchParams.get('firstFrame');
  const initialLastFrame = searchParams.get('lastFrame');
  const initialReferenceImages = searchParams.get('referenceImages');
  const initialMode = searchParams.get('mode');

  // Determine if this is the video page
  const isVideo = mediaType === 'video';
  const defaultModel = isVideo ? DEFAULT_VIDEO_MODEL : DEFAULT_IMAGE_MODEL;

  // Validate initialModel - fall back to default if invalid.
  // For video models, also apply page default override (e.g., seedance-2-0
  // page defaults to seedance-2-0-fast).
  const validatedInitialModel = (() => {
    if (!initialModel) return defaultModel;
    if (isVideo) {
      const pageDefault = getPageDefaultModel(initialModel);
      if (isValidVideoModel(pageDefault)) return pageDefault;
      return isValidVideoModel(initialModel) ? initialModel : defaultModel;
    }
    return isValidImageModel(initialModel) ? initialModel : defaultModel;
  })();

  // Gallery tab state - switch to my-creations when generation starts
  const [galleryTab, setGalleryTab] = useState('explore');

  // Internal state for selected model - validated from URL via initialModel prop
  const [selectedModel, setSelectedModel] = useState(validatedInitialModel);

  // ─── Form state ─────────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState(initialPrompt);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [resolution, setResolution] = useState('1K');
  // Video-specific state
  const [duration, setDuration] = useState('5');
  const [videoResolution, setVideoResolution] = useState('1080p');
  const [videoAspectRatio, setVideoAspectRatio] = useState('Auto');
  const [generateAudio, setGenerateAudio] = useState(true);

  // Image-to-image inputs (multiple) — also picked up by the FloatingGenerateBar.
  const [img2imgInputs, setImg2imgInputs] = useState<UploadedImage[]>([]);

  // First/last frame inputs for video — kept as arrays so they slot directly
  // into FloatingGenerateBar's CompactImageInput tiles.
  const [img2vidFirstFrameInputs, setImg2vidFirstFrameInputs] = useState<
    UploadedImage[]
  >([]);
  const [img2vidLastFrameInputs, setImg2vidLastFrameInputs] = useState<
    UploadedImage[]
  >([]);

  // Video sub-mode: 'image' (image-to-video, default) or 'reference' (reference-to-video).
  // Reference mode swaps the upload tile to a multi-image reference picker AND
  // filters the model list to reference-supporting models (e.g. Veo3 R2V).
  const [videoSubMode, setVideoSubMode] = useState<'image' | 'reference'>(
    initialMode === 'reference' ? 'reference' : 'image'
  );

  // Reference-image inputs (used when videoSubMode === 'reference').
  // Veo3 R2V supports up to 3 reference images.
  const [referenceInputs, setReferenceInputs] = useState<UploadedImage[]>([]);
  const MAX_REFERENCE_INPUTS = 3;

  // Floating workspace bar state
  const sentinelRef = useRef<HTMLDivElement>(null);
  const workspaceCardRef = useRef<HTMLDivElement>(null);
  const [isWorkspaceInView, setIsWorkspaceInView] = useState(true);
  const [floatingExpanded, setFloatingExpanded] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);
  const floatingScrollRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isProModelSelected = isProModel(selectedModel);

  // Derived: are there ready uploads? Used to decide whether the submission
  // is text-to-X or image-to-X (matches AppFloatingBar's auto-detect rule).
  const hasReadyImg2ImgInput = img2imgInputs.some(
    (img) => img.r2Url && !img.uploading
  );
  const hasReadyFirstFrame = img2vidFirstFrameInputs.some(
    (img) => img.r2Url && !img.uploading
  );
  const hasReadyLastFrame = img2vidLastFrameInputs.some(
    (img) => img.r2Url && !img.uploading
  );

  // Reference-mode upload readiness
  const hasReadyReferenceInputs = referenceInputs.some(
    (img) => img.r2Url && !img.uploading
  );

  // Effective image input mode — img2img only when an upload is actually
  // present. The model option list is filtered accordingly so users see the
  // right set of models.
  const isImageInputEffective = hasReadyImg2ImgInput;
  // Video uses an "image input" model variant when there's a first frame OR
  // when the user is in reference-to-video sub-mode.
  const isVideoImageInputEffective =
    videoSubMode === 'reference' ? true : hasReadyFirstFrame;

  // Get image models based on whether the user has uploaded a source image.
  const imageModels = useMemo(() => {
    const mode = isImageInputEffective ? 'image-to-image' : 'text-to-image';
    return getImageModelOptionsByMode(mode);
  }, [isImageInputEffective]);

  // Get video models — when in reference-to-video mode, filter to models
  // that support reference inputs; otherwise use the full text-to-video catalog.
  const videoModels = useMemo(
    () =>
      videoSubMode === 'reference'
        ? getVideoModelOptionsForReference()
        : getVideoModelOptions(),
    [videoSubMode]
  );
  const models = isVideo ? videoModels : imageModels;

  // Build the model option list shape that FloatingGenerateBar expects.
  // Logos (when present) become the icon slot via a small <Image>.
  const modelOptions = useMemo<FloatingBarModelOption[]>(() => {
    return models.map((m) => {
      const logo = 'logo' in m ? (m.logo as string | undefined) : undefined;
      const icon =
        logo !== undefined ? (
          <Image
            key={m.value}
            src={logo}
            alt=""
            width={16}
            height={16}
            className="size-4"
          />
        ) : 'icon' in m && m.icon ? (
          (m.icon as React.ReactNode)
        ) : undefined;
      return { value: m.value, label: m.label, icon };
    });
  }, [models]);

  // Filter aspect ratios based on selected image model's supported ratios
  const filteredAspectRatios = useMemo<FloatingBarAspectRatioOption[]>(() => {
    if (isVideo) return [];
    const modelConfig = getImageModel(selectedModel);
    const list =
      modelConfig?.supportedAspectRatios &&
      modelConfig.supportedAspectRatios.length > 0
        ? ASPECT_RATIOS.filter((r) =>
            modelConfig.supportedAspectRatios!.includes(r.value)
          )
        : ASPECT_RATIOS;
    return list.map((r) => ({
      value: r.value,
      label: r.value,
      icon: <span className={r.iconClass} />,
    }));
  }, [selectedModel, isVideo]);

  // Get video model config for dynamic options
  const videoModelConfig = useMemo(() => {
    if (!isVideo) return undefined;
    return getVideoModelConfig(selectedModel, isVideoImageInputEffective);
  }, [isVideo, selectedModel, isVideoImageInputEffective]);

  const availableDurations = useMemo(() => {
    return videoModelConfig?.supportedDurations || [5, 10, 15];
  }, [videoModelConfig]);

  const availableResolutions = useMemo(() => {
    return videoModelConfig?.supportedResolutions || ['720p', '1080p'];
  }, [videoModelConfig]);

  const availableVideoAspectRatios = useMemo<
    FloatingBarAspectRatioOption[]
  >(() => {
    const supported = videoModelConfig?.supportedAspectRatios || [
      'Auto',
      '16:9',
      '9:16',
    ];
    return VIDEO_ASPECT_RATIOS.filter((r) => supported.includes(r.value)).map(
      (r) => ({
        value: r.value,
        label: r.value,
        icon: <span className={r.iconClass} />,
      })
    );
  }, [videoModelConfig]);

  const modelSupportsAudio = useMemo(() => {
    return videoModelConfig?.supportsAudio || false;
  }, [videoModelConfig]);

  const hasAudioPremium = useMemo(() => {
    return (videoModelConfig?.audioPremiumCredits ?? 0) > 0;
  }, [videoModelConfig]);

  // Whether the current video model supports a separate last frame
  // (image-to-video flexible mode = first + optional last frame).
  const videoSupportsLastFrame = useMemo(() => {
    if (!isVideo) return false;
    try {
      const backendModelId = resolveBackendModelId(selectedModel, true);
      const config = VIDEO_MODELS[backendModelId];
      return config?.imageCapabilities?.flexibleMode === true;
    } catch {
      return false;
    }
  }, [isVideo, selectedModel]);

  // Calculate total video credits.
  const totalVideoCredits = useMemo(() => {
    if (!isVideo || !videoModelConfig) return 0;
    try {
      const backendModelId = resolveBackendModelId(
        selectedModel,
        isVideoImageInputEffective
      );
      const durationNum = Number(duration) || 0;
      const includeAudio =
        modelSupportsAudio && generateAudio && hasAudioPremium;
      return calculateVideoCredits(
        backendModelId,
        durationNum,
        includeAudio,
        videoResolution
      );
    } catch {
      const pricing = videoModelConfig.perSecondCredits;
      const perSecond =
        typeof pricing === 'number'
          ? pricing
          : Math.max(
              ...Object.values(pricing).filter(
                (p): p is number => p !== undefined
              )
            );
      const durationNum = Number(duration) || 0;
      return Math.round(perSecond * durationNum * 10) / 10;
    }
  }, [
    isVideo,
    videoModelConfig,
    selectedModel,
    isVideoImageInputEffective,
    duration,
    modelSupportsAudio,
    generateAudio,
    hasAudioPremium,
    videoResolution,
  ]);

  // Get credits for the currently selected image model.
  const getCreditsForModel = useCallback(() => {
    return calculateImageCredits(selectedModel, resolution);
  }, [selectedModel, resolution]);

  const requiredCredits = isVideo ? totalVideoCredits : getCreditsForModel();

  // Reset video settings when model changes and current values are not supported
  useEffect(() => {
    if (!isVideo || !videoModelConfig) return;

    if (!availableDurations.includes(Number(duration))) {
      setDuration(String(availableDurations[0]));
    }

    if (!availableResolutions.includes(videoResolution)) {
      setVideoResolution(availableResolutions[0]);
    }

    const supportedAspectRatios = videoModelConfig.supportedAspectRatios || [
      'Auto',
      '16:9',
      '9:16',
    ];
    if (!supportedAspectRatios.includes(videoAspectRatio)) {
      setVideoAspectRatio(supportedAspectRatios[0]);
    }
  }, [
    isVideo,
    videoModelConfig,
    availableDurations,
    availableResolutions,
    duration,
    videoResolution,
    videoAspectRatio,
  ]);

  // Image / video generation hooks — only stopPolling is used today; the
  // actual generate() calls happen on /app via usePendingGeneration after
  // the redirect. We still need stopPolling for the unmount cleanup so any
  // in-flight polling started by an earlier mount of this component is torn
  // down (e.g. when the user navigates between marketing pages).
  const { stopPolling } = useImageGeneration();
  const { stopPolling: stopVideoPolling } = useVideoGeneration();
  const { status: generationStatus, reset: resetGenerationState } =
    useImageGenerationStore();

  // Cleanup polling and reset generation state on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      stopVideoPolling();
      resetGenerationState();
    };
  }, [stopPolling, stopVideoPolling, resetGenerationState]);

  // Prefetch /app on mount so the click → navigate handoff is instant.
  useEffect(() => {
    router.prefetch('/app?target=image');
    router.prefetch('/app?target=video');
  }, [router]);

  // Floating workspace bar - detect when input card scrolls out of viewport
  useEffect(() => {
    if (isGlass) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const inView = entry.isIntersecting;
        setIsWorkspaceInView(inView);
        if (inView) {
          setFloatingExpanded(false);
        } else if (workspaceCardRef.current) {
          setCardHeight(workspaceCardRef.current.offsetHeight);
        }
      },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isGlass]);

  // Collapse floating bar when user scrolls down while expanded
  useEffect(() => {
    if (!floatingExpanded) return;
    floatingScrollRef.current = window.scrollY;
    const onScroll = () => {
      if (window.scrollY > floatingScrollRef.current + 30) {
        setFloatingExpanded(false);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [floatingExpanded]);

  // Reset model selection when image-input mode changes if current model
  // not available in the new mode.
  useEffect(() => {
    if (isVideo) return;
    const mode = isImageInputEffective ? 'image-to-image' : 'text-to-image';
    const availableModels = getImageModelOptionsByMode(mode);
    if (!availableModels.find((m) => m.value === selectedModel)) {
      setSelectedModel(availableModels[0].value);
    }
  }, [isImageInputEffective, isVideo, selectedModel]);

  // Auto-correct aspect ratio when switching to a model that doesn't support it
  useEffect(() => {
    if (isVideo) return;
    const modelConfig = getImageModel(selectedModel);
    if (
      modelConfig?.supportedAspectRatios &&
      !modelConfig.supportedAspectRatios.includes(aspectRatio)
    ) {
      setAspectRatio(modelConfig.supportedAspectRatios[0]);
    }
  }, [selectedModel, isVideo, aspectRatio]);

  // Sync prompt state with URL changes (for regenerate feature)
  useEffect(() => {
    if (initialPrompt) {
      setPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  // Auto-generate on dashboard when redirected from hero with autoGenerate=true
  const autoGenerate = searchParams.get('autoGenerate');
  const autoGenerateTriggeredRef = useRef(false);

  // Prefill input images from URL params (hero redirect & regenerate).
  useEffect(() => {
    if (initialInputImages) {
      const imageUrls = initialInputImages.split(',').filter(Boolean);
      if (imageUrls.length > 0) {
        const prefilled: UploadedImage[] = imageUrls.map((url, index) => ({
          id: `prefilled-${index}-${Date.now()}`,
          file: null as unknown as File,
          previewUrl: url,
          r2Url: url,
          uploading: false,
        }));
        setImg2imgInputs(prefilled);
      }
    }

    if (initialFirstFrame) {
      setImg2vidFirstFrameInputs([
        {
          id: `prefilled-first-frame-${Date.now()}`,
          file: null as unknown as File,
          previewUrl: initialFirstFrame,
          r2Url: initialFirstFrame,
          uploading: false,
        },
      ]);
    }

    if (initialLastFrame) {
      setImg2vidLastFrameInputs([
        {
          id: `prefilled-last-frame-${Date.now()}`,
          file: null as unknown as File,
          previewUrl: initialLastFrame,
          r2Url: initialLastFrame,
          uploading: false,
        },
      ]);
    }

    if (initialReferenceImages) {
      const refUrls = initialReferenceImages.split(',').filter(Boolean);
      if (refUrls.length > 0) {
        const prefilled: UploadedImage[] = refUrls.map((url, index) => ({
          id: `prefilled-ref-${index}-${Date.now()}`,
          file: null as unknown as File,
          previewUrl: url,
          r2Url: url,
          uploading: false,
        }));
        setReferenceInputs(prefilled);
      }
    }
  }, [
    initialInputImages,
    initialFirstFrame,
    initialLastFrame,
    initialReferenceImages,
  ]);

  // Cleanup preview URLs on unmount
  const img2imgInputsRef = useRef(img2imgInputs);
  const firstFrameRef = useRef(img2vidFirstFrameInputs);
  const lastFrameRef = useRef(img2vidLastFrameInputs);
  const referenceInputsRef = useRef(referenceInputs);
  img2imgInputsRef.current = img2imgInputs;
  firstFrameRef.current = img2vidFirstFrameInputs;
  lastFrameRef.current = img2vidLastFrameInputs;
  referenceInputsRef.current = referenceInputs;

  useEffect(() => {
    return () => {
      for (const img of img2imgInputsRef.current) {
        URL.revokeObjectURL(img.previewUrl);
      }
      for (const img of firstFrameRef.current) {
        URL.revokeObjectURL(img.previewUrl);
      }
      for (const img of lastFrameRef.current) {
        URL.revokeObjectURL(img.previewUrl);
      }
      for (const img of referenceInputsRef.current) {
        URL.revokeObjectURL(img.previewUrl);
      }
    };
  }, []);

  // When sub-mode changes to 'reference', reset model if it doesn't support
  // reference-to-video. When it changes back to 'image', reset to default
  // video model if the current one isn't a regular video model.
  useEffect(() => {
    if (!isVideo) return;
    if (videoSubMode === 'reference') {
      const referenceModels = getVideoModelOptionsForReference();
      if (!referenceModels.find((m) => m.value === selectedModel)) {
        if (referenceModels.length > 0) {
          setSelectedModel(referenceModels[0].value);
        }
      }
    } else {
      const all = getVideoModelOptions();
      if (!all.find((m) => m.value === selectedModel)) {
        setSelectedModel(DEFAULT_VIDEO_MODEL);
      }
    }
  }, [videoSubMode, isVideo, selectedModel]);

  // Switching sub-mode clears the unrelated inputs so the user doesn't carry
  // a stale first/last frame into reference mode (or vice versa).
  const handleVideoSubModeChange = useCallback(
    (next: 'image' | 'reference') => {
      if (next === videoSubMode) return;
      setVideoSubMode(next);
      // Clear opposite-mode uploads
      if (next === 'reference') {
        for (const img of img2vidFirstFrameInputs) {
          URL.revokeObjectURL(img.previewUrl);
        }
        for (const img of img2vidLastFrameInputs) {
          URL.revokeObjectURL(img.previewUrl);
        }
        setImg2vidFirstFrameInputs([]);
        setImg2vidLastFrameInputs([]);
      } else {
        for (const img of referenceInputs) {
          URL.revokeObjectURL(img.previewUrl);
        }
        setReferenceInputs([]);
      }
    },
    [
      videoSubMode,
      img2vidFirstFrameInputs,
      img2vidLastFrameInputs,
      referenceInputs,
    ]
  );

  // Reset last-frame input when switching to a model that doesn't support it.
  useEffect(() => {
    if (!videoSupportsLastFrame && img2vidLastFrameInputs.length > 0) {
      for (const img of img2vidLastFrameInputs) {
        URL.revokeObjectURL(img.previewUrl);
      }
      setImg2vidLastFrameInputs([]);
    }
    // Only run when model capability changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSupportsLastFrame]);

  const isGenerating =
    generationStatus === 'submitting' || generationStatus === 'polling';

  // Image resolution options (Pro models only) — { value, label }
  const imageResolutionOptions = useMemo(
    () => RESOLUTIONS.map((r) => ({ value: r.value, label: r.label })),
    []
  );

  // Build the URL we'd redirect the user to if they were not logged in.
  const storeAndBuildRedirectUrl = useCallback(() => {
    if (prompt.trim()) {
      try {
        sessionStorage.setItem('heroWorkspacePrompt', prompt.trim());
      } catch {
        // sessionStorage unavailable
      }
    }

    const params = new URLSearchParams();
    params.set('autoGenerate', 'true');
    if (selectedModel !== defaultModel) params.set('model', selectedModel);
    if (!isVideo) {
      if (isImageInputEffective) params.set('mode', 'image');
      if (aspectRatio !== '1:1') params.set('ratio', aspectRatio);
      if (resolution !== '1K') params.set('resolution', resolution);
    }

    const readyImages = img2imgInputs
      .filter((img) => img.r2Url && !img.uploading)
      .map((img) => img.r2Url!);
    if (readyImages.length > 0) {
      params.set('inputImages', readyImages.join(','));
    }

    const firstReady = img2vidFirstFrameInputs.find(
      (img) => img.r2Url && !img.uploading
    );
    if (firstReady?.r2Url) params.set('firstFrame', firstReady.r2Url);

    const lastReady = img2vidLastFrameInputs.find(
      (img) => img.r2Url && !img.uploading
    );
    if (lastReady?.r2Url) params.set('lastFrame', lastReady.r2Url);

    const readyRefImages = referenceInputs
      .filter((img) => img.r2Url && !img.uploading)
      .map((img) => img.r2Url!);
    if (readyRefImages.length > 0) {
      params.set('referenceImages', readyRefImages.join(','));
    }
    if (isVideo && videoSubMode === 'reference') {
      params.set('mode', 'reference');
    }

    const basePath = mediaType === 'video' ? '/video' : '/image';
    return `${basePath}?${params.toString()}`;
  }, [
    prompt,
    selectedModel,
    defaultModel,
    isVideo,
    isImageInputEffective,
    aspectRatio,
    resolution,
    mediaType,
    videoSubMode,
    img2imgInputs,
    img2vidFirstFrameInputs,
    img2vidLastFrameInputs,
    referenceInputs,
  ]);

  // Handle generation: stage params + optimistic placeholder, then redirect to /app.
  const handleGenerate = useCallback(async () => {
    if (!currentUser) {
      setShowLoginModal(true);
      return;
    }

    if (
      !prompt.trim() &&
      !isImageInputEffective &&
      !hasReadyFirstFrame &&
      !hasReadyReferenceInputs
    ) {
      toast({
        title: t('promptRequired'),
        description: t('promptRequiredDescription'),
        variant: 'destructive',
      });
      return;
    }

    // Reference-to-Video requires exactly 3 reference images (Veo3 R2V).
    if (isVideo && videoSubMode === 'reference') {
      const ready = referenceInputs.filter(
        (img) => img.r2Url && !img.uploading
      );
      if (ready.length !== MAX_REFERENCE_INPUTS) {
        toast({
          title: t('referenceImageRequired'),
          description: t('referenceImageExactlyThreeRequired'),
          variant: 'destructive',
        });
        return;
      }
    }

    if (!checkCredits(requiredCredits)) {
      return;
    }

    // Helper: store video generation params and redirect to /app.
    const redirectVideoGeneration = (
      imageUrls: string[],
      generationType: string,
      imageRoles?: ('first_frame' | 'last_frame' | 'reference_image')[]
    ) => {
      const shouldSendAudio =
        modelSupportsAudio && hasAudioPremium ? generateAudio : undefined;

      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const store = useAppPageStore.getState();
      store.addActiveGeneration({
        id: tempId,
        taskId: tempId,
        status: 'SUBMITTING',
        mediaType: 'video',
        startTime: Date.now(),
        prompt: prompt.trim(),
        modelId: selectedModel,
      });
      store.setPendingGeneration({
        type: 'video',
        tempId,
        model: selectedModel,
        prompt: prompt.trim(),
        generationType,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        imageRoles,
        aspectRatio: videoAspectRatio,
        duration: Number(duration),
        resolution: videoResolution,
        generateAudio: shouldSendAudio,
      });
      router.push('/app?target=video');
    };

    // ─── Video branch ───────────────────────────────────────────────────
    if (isVideo) {
      // Reference-to-video sub-mode
      if (videoSubMode === 'reference') {
        const refUrls = referenceInputs
          .filter((img) => img.r2Url && !img.uploading)
          .map((img) => img.r2Url!);
        const refRoles = refUrls.map(() => 'reference_image' as const);
        redirectVideoGeneration(refUrls, 'REFERENCE_2_VIDEO', refRoles);
        return;
      }

      const firstUrl = img2vidFirstFrameInputs.find(
        (img) => img.r2Url && !img.uploading
      )?.r2Url;
      const lastUrl =
        videoSupportsLastFrame && hasReadyLastFrame
          ? img2vidLastFrameInputs.find((img) => img.r2Url && !img.uploading)
              ?.r2Url
          : undefined;

      if (firstUrl && lastUrl) {
        redirectVideoGeneration(
          [firstUrl, lastUrl],
          'FIRST_AND_LAST_FRAMES_2_VIDEO',
          ['first_frame', 'last_frame']
        );
      } else if (firstUrl) {
        redirectVideoGeneration([firstUrl], 'IMAGE_2_VIDEO', ['first_frame']);
      } else {
        redirectVideoGeneration([], 'TEXT_2_VIDEO');
      }
      return;
    }

    // ─── Image branch ───────────────────────────────────────────────────
    const imageUrls = isImageInputEffective
      ? img2imgInputs
          .filter((img) => img.r2Url && !img.uploading)
          .map((img) => img.r2Url!)
      : undefined;

    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const store = useAppPageStore.getState();
    store.addActiveGeneration({
      id: tempId,
      taskId: tempId,
      status: 'SUBMITTING',
      mediaType: 'image',
      startTime: Date.now(),
      prompt: prompt.trim(),
      modelId: selectedModel,
    });
    store.setPendingGeneration({
      type: 'image',
      tempId,
      modelId: selectedModel,
      prompt: prompt.trim(),
      mode: isImageInputEffective ? 'image-to-image' : 'text-to-image',
      imageUrls,
      aspectRatio,
      resolution: isProModelSelected ? resolution : undefined,
    });
    router.push('/app?target=image');
  }, [
    currentUser,
    prompt,
    isImageInputEffective,
    isVideo,
    videoSubMode,
    img2imgInputs,
    img2vidFirstFrameInputs,
    img2vidLastFrameInputs,
    referenceInputs,
    hasReadyFirstFrame,
    hasReadyReferenceInputs,
    videoSupportsLastFrame,
    hasReadyLastFrame,
    selectedModel,
    aspectRatio,
    videoAspectRatio,
    duration,
    resolution,
    isProModelSelected,
    generateAudio,
    modelSupportsAudio,
    hasAudioPremium,
    toast,
    t,
    checkCredits,
    requiredCredits,
    router,
    videoResolution,
  ]);

  const handleRegenerate = useCallback(() => {
    resetGenerationState();
    handleGenerate();
  }, [resetGenerationState, handleGenerate]);

  // Cancel generation - stop polling and reset state
  const handleCancelGeneration = useCallback(() => {
    stopPolling();
    stopVideoPolling();
    resetGenerationState();
  }, [stopPolling, stopVideoPolling, resetGenerationState]);

  // Try with Wan 2.6
  const [pendingWan26, setPendingWan26] = useState(false);

  const handleTryWithWan26 = useCallback(() => {
    setSelectedModel(WAN26_MODEL_ID);
    resetGenerationState();
    setPendingWan26(true);
  }, [resetGenerationState]);

  useEffect(() => {
    if (!pendingWan26) return;
    const timer = setTimeout(() => setPendingWan26(false), 5000);
    return () => clearTimeout(timer);
  }, [pendingWan26]);

  useEffect(() => {
    if (!pendingWan26 || selectedModel !== WAN26_MODEL_ID) return;
    if (!isVideo || !videoModelConfig) return;

    const durOk = (videoModelConfig.supportedDurations || []).includes(
      Number(duration)
    );
    const resOk = (videoModelConfig.supportedResolutions || []).includes(
      videoResolution
    );
    const arOk = (videoModelConfig.supportedAspectRatios || []).includes(
      videoAspectRatio
    );

    if (!durOk || !resOk || !arOk) return;

    setPendingWan26(false);
    handleGenerate();
  }, [
    pendingWan26,
    selectedModel,
    isVideo,
    videoModelConfig,
    duration,
    videoResolution,
    videoAspectRatio,
    handleGenerate,
  ]);

  // Auto-generate effect: triggers once on hero redirect.
  useEffect(() => {
    if (isGlass) return;
    if (autoGenerate !== 'true') return;
    if (autoGenerateTriggeredRef.current) return;
    if (isCreditsLoading) return;

    const hasContent =
      prompt.trim() || hasReadyImg2ImgInput || hasReadyFirstFrame;
    if (!hasContent) return;

    autoGenerateTriggeredRef.current = true;

    const newParams = new URLSearchParams(searchParams.toString());
    newParams.delete('autoGenerate');
    const qs = newParams.toString();
    const basePath = mediaType === 'video' ? '/video' : '/image';
    router.replace(qs ? `${basePath}?${qs}` : basePath);

    handleGenerate();
  }, [
    autoGenerate,
    isGlass,
    isCreditsLoading,
    prompt,
    hasReadyImg2ImgInput,
    hasReadyFirstFrame,
    searchParams,
    mediaType,
    router,
    handleGenerate,
  ]);

  // Add a generated image to the prompt input (auto-switches to img2img mode
  // since the upload tile gets populated).
  const handleAddToPrompt = useCallback(
    (imageUrl: string) => {
      const newImage: UploadedImage = {
        id: crypto.randomUUID(),
        file: null as unknown as File,
        previewUrl: imageUrl,
        r2Url: imageUrl,
        uploading: false,
      };
      setImg2imgInputs((prev) => {
        if (prev.length >= MAX_IMG2IMG_INPUTS) {
          toast({
            title: t('maxImagesReached'),
            description: t('maxImagesReachedDescription', {
              max: MAX_IMG2IMG_INPUTS,
            }),
            variant: 'destructive',
          });
          return prev;
        }
        return [...prev, newImage];
      });
    },
    [toast, t]
  );

  // Switch between image / video generators in-place.
  // Per design: clear prompt and reset model to the default for the new
  // mediaType so the user always lands on a clean, valid state.
  const handleSwitchMediaType = useCallback(
    (next: MediaType) => {
      if (next === mediaType) return;
      setMediaType(next);
      setSelectedModel(
        next === 'video' ? DEFAULT_VIDEO_MODEL : DEFAULT_IMAGE_MODEL
      );
      setPrompt('');
      setImg2imgInputs([]);
      setImg2vidFirstFrameInputs([]);
      setImg2vidLastFrameInputs([]);
      setReferenceInputs([]);
      setVideoSubMode('image');
    },
    [mediaType]
  );

  const pillBg = isGlass
    ? 'bg-white/12 dark:bg-white/12 dark:hover:bg-white/18 dark:data-[state=open]:bg-white/18'
    : 'bg-secondary/50';

  const showFloatingBar = !isGlass && !isWorkspaceInView;
  const isFloating = showFloatingBar && floatingExpanded;

  // Generate-button enable rule: a prompt OR an upload (image-to-image
  // skips the prompt requirement, matching AppFloatingBar).
  const canGenerate =
    !isGenerating &&
    (!!prompt.trim() || isImageInputEffective || isVideoImageInputEffective);

  // The shared bar wrapper className — controls inline vs floating styling.
  // Inline: full-width card with border. Floating: max-w 900px with backdrop blur.
  const barClassName = isGlass
    ? 'bg-white/[0.08] backdrop-blur-2xl border border-white/15 max-w-none'
    : isFloating
      ? 'bg-sidebar/40 backdrop-blur-2xl shadow-2xl'
      : 'bg-sidebar border max-w-none';

  return (
    <div className={cn('flex flex-1 flex-col gap-6', !isGlass && 'p-4 md:p-6')}>
      {/* Header - hidden in glass mode */}
      {!isGlass && (
        <div>
          <div className="text-2xl font-bold md:text-3xl">
            {isVideo ? t('videoTitle') : t('title')}
          </div>
        </div>
      )}

      {/* Sentinel for floating bar viewport detection */}
      {!isGlass && (
        <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
      )}

      {/* Spacer when input card is in floating expanded mode */}
      {showFloatingBar && floatingExpanded && (
        <div style={{ height: cardHeight }} className="shrink-0" />
      )}

      {/* Input card — either inline at the top of the workspace or pinned
          to the viewport bottom when the user has scrolled past it. */}
      <div
        ref={workspaceCardRef}
        className={cn(
          isFloating &&
            'fixed bottom-6 z-50 -translate-x-1/2 left-1/2 w-[calc(100vw-2rem)] max-w-[900px] md:left-[calc(50%+var(--sidebar-width)/2)] md:w-[calc(100vw-var(--sidebar-width)-3rem)]'
        )}
      >
        <FloatingGenerateBar
          className={barClassName}
          pillBg={pillBg}
          hideBorderGlow={!isFloating && !isGlass}
          mediaType={mediaType}
          onSwitchMediaType={handleSwitchMediaType}
          prompt={prompt}
          onPromptChange={setPrompt}
          textareaRef={textareaRef}
          textareaMinHeightClass={isFloating ? 'min-h-[60px]' : 'min-h-[80px]'}
          promptOptimizerImageUrl={
            img2imgInputs.find((img) => img.r2Url)?.r2Url ||
            img2vidFirstFrameInputs.find((img) => img.r2Url)?.r2Url
          }
          disabled={isGenerating}
          selectedModel={selectedModel}
          modelOptions={modelOptions}
          onModelChange={setSelectedModel}
          aspectRatio={isVideo ? videoAspectRatio : aspectRatio}
          aspectRatioOptions={
            isVideo ? availableVideoAspectRatios : filteredAspectRatios
          }
          onAspectRatioChange={isVideo ? setVideoAspectRatio : setAspectRatio}
          imageResolution={isProModelSelected ? resolution : undefined}
          imageResolutionOptions={
            isProModelSelected ? imageResolutionOptions : undefined
          }
          onImageResolutionChange={
            isProModelSelected ? setResolution : undefined
          }
          videoDuration={duration}
          videoDurationOptions={availableDurations}
          onVideoDurationChange={setDuration}
          videoResolution={videoResolution}
          videoResolutionOptions={availableResolutions}
          onVideoResolutionChange={setVideoResolution}
          showAudioToggle={modelSupportsAudio && hasAudioPremium}
          generateAudio={generateAudio}
          onGenerateAudioChange={setGenerateAudio}
          img2imgInputs={img2imgInputs}
          onImg2imgInputsChange={setImg2imgInputs}
          maxImg2imgInputs={MAX_IMG2IMG_INPUTS}
          img2vidFirstFrameInputs={img2vidFirstFrameInputs}
          onImg2vidFirstFrameInputsChange={setImg2vidFirstFrameInputs}
          img2vidLastFrameInputs={img2vidLastFrameInputs}
          onImg2vidLastFrameInputsChange={setImg2vidLastFrameInputs}
          showLastFrameSlot={videoSupportsLastFrame}
          showVideoSubModeToggle
          videoSubMode={videoSubMode}
          onVideoSubModeChange={handleVideoSubModeChange}
          referenceInputs={referenceInputs}
          onReferenceInputsChange={setReferenceInputs}
          maxReferenceInputs={MAX_REFERENCE_INPUTS}
          requiredCredits={requiredCredits}
          canGenerate={canGenerate}
          onGenerate={handleGenerate}
          generateLabel={isVideo ? t('animate') : t('generate')}
        />
      </div>

      {/* Gallery Section - hidden in glass mode */}
      {!isGlass && (
        <ImageGallery
          activeTab={galleryTab}
          onTabChange={setGalleryTab}
          onRegenerate={handleRegenerate}
          onCancel={handleCancelGeneration}
          onAddToPrompt={handleAddToPrompt}
          onTryWithWan26={handleTryWithWan26}
        />
      )}

      {/* Floating Collapsed Bar - appears when workspace scrolls out of view */}
      {showFloatingBar && !floatingExpanded && (
        <div className="fixed bottom-6 z-50 -translate-x-1/2 left-1/2 md:left-[calc(50%+var(--sidebar-width)/2)] animate-in fade-in slide-in-from-bottom-4 duration-300 w-[calc(100vw-2rem)] max-w-[700px]">
          <FloatingCollapsedBar
            prompt={prompt}
            placeholder={t('promptPlaceholder')}
            credits={requiredCredits}
            isGenerating={isGenerating}
            generateLabel={isVideo ? t('animate') : t('generate')}
            onBarClick={() => setFloatingExpanded(true)}
            onGenerate={handleGenerate}
            canGenerate={canGenerate}
          />
        </div>
      )}

      {/* Login Modal for unauthenticated users */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent
          showCloseButton={false}
          className="!w-[calc(100vw-1.5rem)] !max-w-[460px] !max-h-[92vh] overflow-hidden p-0 rounded-2xl border-0 bg-transparent"
        >
          <DialogHeader className="hidden">
            <DialogTitle>Login</DialogTitle>
          </DialogHeader>
          {showLoginModal ? (
            <LoginModal
              callbackUrl={
                isGlass
                  ? storeAndBuildRedirectUrl()
                  : typeof window !== 'undefined'
                    ? window.location.pathname
                    : undefined
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* NSFW Upgrade Dialog */}
      <NsfwUpgradeDialog
        open={nsfwDialogState !== null}
        onOpenChange={(open) => !open && setNsfwDialogState(null)}
        variant={nsfwDialogState ?? 'blocked'}
      />
    </div>
  );
}
