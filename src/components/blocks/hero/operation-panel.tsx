'use client';

import {
  PRESET_ROLES,
  type Role,
  RoleBand,
  RoleChip,
} from '@/components/blocks/hero/role-band';
import { AssetPickerModal } from '@/components/shared/asset-picker-modal';
import { BorderGlow } from '@/components/shared/border-glow';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCaptchaGatedUpload } from '@/hooks/use-captcha-gated-upload';
import { validateSd2ManxueImage } from '@/lib/image-resize';
import { useRoles } from '@/hooks/use-roles';
import {
  DEFAULT_IMAGE_MODEL,
  calculateImageCredits,
  getImageModel,
  getImageModelOptionsByMode,
} from '@/image/config/image-models';
import { useCurrentPlan } from '@/hooks/use-payment';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useSubscriptionRequiredDialogStore } from '@/stores/subscription-required-dialog-store';
import {
  DEFAULT_VIDEO_MODEL,
  calculateVideoCredits,
  getLockedVideoResolutions,
  getVideoModelConfig,
  getVideoModelOptions,
  getVideoModelOptionsForEdit,
  getVideoModelOptionsForImageToVideo,
  getVideoModelOptionsForReference,
} from '@/video/config/video-models';
import {
  ArrowLeftRight,
  Crown,
  ImageIcon,
  ImagePlus,
  Loader2,
  Music,
  Plus,
  SlidersHorizontal,
  Sparkles,
  VideoIcon,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

type MediaType = 'video' | 'image';
type VideoSubMode = 'generate' | 'reference' | 'edit';
type UploadTarget =
  | 'first_frame'
  | 'last_frame'
  | 'reference'
  | 'edit_video'
  | 'edit_image'
  | 'image_input';

interface UploadedImage {
  id: string;
  file: File;
  previewUrl: string;
  r2Url?: string;
  uploading: boolean;
  error?: string;
  /** Display name (role label) when this entry came from the role band. */
  roleName?: string;
  /** Tiny avatar URL used by the in-prompt role chip — defaults to
   *  previewUrl when the entry came from a raw upload. */
  roleAvatarUrl?: string;
  /** Stable identifier used to dedupe role selections across the band. */
  roleId?: string;
  /** Pre-registered Seedance 2 asset id. Set when the entry came from a
   *  role whose moderation has cleared. When present and the target
   *  model is `seedance-2`, the panel submits `asset://{seedanceAssetId}`
   *  instead of the raw R2 url (per sd2_manxue API spec). */
  seedanceAssetId?: string;
  /** For video/audio reference uploads — duration in seconds. Tracked
   *  so we can enforce sd2_manxue's 15s cumulative cap per media type. */
  durationSeconds?: number;
  /** 'image' | 'video' | 'audio' — set on bucketed uploads so the chip
   *  row can render type-appropriate visuals. Defaults to 'image'. */
  kind?: 'image' | 'video' | 'audio';
}

/**
 * Compact chip for video / audio reference uploads. Mirrors RoleChip's
 * shape but renders a type icon instead of an avatar, since we don't
 * have a thumbnail for non-image references.
 */
function MediaChip({
  kind,
  label,
  uploading,
  error,
  onRemove,
}: {
  kind: 'video' | 'audio';
  label: string;
  uploading?: boolean;
  error?: string;
  onRemove: () => void;
}) {
  const Icon = kind === 'video' ? VideoIcon : Music;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md py-1 pl-1.5 pr-1.5 text-xs',
        error
          ? 'bg-destructive/10 text-destructive'
          : 'bg-foreground/[0.06] text-foreground/85'
      )}
    >
      {uploading ? (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      ) : (
        <Icon className="size-3.5 text-muted-foreground" />
      )}
      <span className="font-medium">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

interface OperationPanelProps {
  isGenerating: boolean;
  /** Called when an upload is attempted while the user is not logged
   *  in — caller should surface the login modal. */
  onRequireAuth?: () => void;
  onGenerate: (params: {
    mediaType: MediaType;
    model: string;
    prompt: string;
    image_urls?: string[];
    image_roles?: ('first_frame' | 'last_frame' | 'reference_image')[];
    /** Input video URL for video-edit submissions (wan2-7 edit mode). */
    video_url?: string;
    aspect_ratio: string;
    duration: number;
    resolution: string;
    generationType: string;
    referenceVideos?: string[];
    referenceAudios?: string[];
    /** Sum of input video durations (reference videos or edit source video),
     * forwarded to the server so wan27-r2v / wan27-videoedit billing can add
     * input_video_duration to output_video_duration per Ali's spec. */
    inputVideoDurationSeconds?: number;
    generate_audio?: boolean;
    output_format?: 'png' | 'jpg';
  }) => void;
}

function AspectRatioIcon({ ratio }: { ratio: string }) {
  const sizes: Record<string, { w: number; h: number }> = {
    '16:9': { w: 18, h: 10 },
    '9:16': { w: 9, h: 16 },
    '4:3': { w: 16, h: 12 },
    '3:4': { w: 11, h: 14 },
    '21:9': { w: 22, h: 9 },
    '1:1': { w: 13, h: 13 },
  };
  const size = sizes[ratio] || { w: 14, h: 14 };
  return (
    <div className="flex h-4 items-center justify-center">
      <div
        className="rounded-[2px] bg-current opacity-70"
        style={{ width: size.w, height: size.h }}
      />
    </div>
  );
}

const PILL =
  'h-8 w-auto gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.06] px-3 text-xs shadow-none hover:bg-foreground/[0.1]';

export default function OperationPanel({
  isGenerating,
  onRequireAuth,
  onGenerate,
}: OperationPanelProps) {
  const t = useTranslations('HomePage.videoHero');
  const { data: session } = authClient.useSession();
  const { data: planData } = useCurrentPlan(session?.user?.id);
  const isSubscribed =
    !!planData?.currentPlan && !planData.currentPlan.isFree;
  const openSubscriptionDialog = useSubscriptionRequiredDialogStore(
    (s) => s.openDialog
  );

  // ── State ──────────────────────────────────────────────────────────────
  const [mediaType, setMediaType] = useState<MediaType>('video');
  const [videoSubMode, setVideoSubMode] = useState<VideoSubMode>('generate');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_VIDEO_MODEL);
  const [prompt, setPrompt] = useState('');
  const [generateAudio, setGenerateAudio] = useState(false);

  const [firstFrameImages, setFirstFrameImages] = useState<UploadedImage[]>([]);
  const [lastFrameImages, setLastFrameImages] = useState<UploadedImage[]>([]);
  const [referenceImages, setReferenceImages] = useState<UploadedImage[]>([]);
  // sd2_manxue reference mode also accepts videos + audios alongside
  // images. We bucket files by MIME on upload; each bucket has its own
  // upstream cap (3 / 3) + a cumulative 15s / 500MB budget.
  const [referenceVideos, setReferenceVideos] = useState<UploadedImage[]>([]);
  const [referenceAudios, setReferenceAudios] = useState<UploadedImage[]>([]);
  const [imageInputImages, setImageInputImages] = useState<UploadedImage[]>([]);
  // Stubbed front-end slots for video Edit mode (no backend yet)
  const [editVideoStub, setEditVideoStub] = useState<UploadedImage[]>([]);
  const [editImageStub, setEditImageStub] = useState<UploadedImage[]>([]);

  const { uploadWithCaptcha, captchaDialog } = useCaptchaGatedUpload();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputTargetRef = useRef<UploadTarget>('first_frame');

  const [expanded, setExpanded] = useState(false);
  const [floating, setFloating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const next = rect.bottom < window.innerHeight - 8;
      setFloating(next);
      if (next) setExpanded(false);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // ── Derived: backend sub-mode for model filtering ─────────────────────
  // Video Generate auto-picks between text/image-to-video based on whether
  // a first frame was uploaded; Reference always uses the reference flow;
  // Edit has no backend yet so we fall back to text-to-video for model list.
  const effectiveBackendSubMode = useMemo(() => {
    if (mediaType !== 'video') return 'text-to-video';
    if (videoSubMode === 'reference') return 'reference-to-video';
    if (videoSubMode === 'edit') return 'text-to-video';
    return firstFrameImages.length > 0 ? 'image-to-video' : 'text-to-video';
  }, [mediaType, videoSubMode, firstFrameImages.length]);

  const isImageInput =
    effectiveBackendSubMode === 'image-to-video' ||
    effectiveBackendSubMode === 'reference-to-video';
  const currentModelConfig = getVideoModelConfig(selectedModel, isImageInput);

  // Image-mode picker reads from the user-paid surface's allowed list,
  // filtered by current modality (image_input presence → i2i).
  const imageMode: 'text-to-image' | 'image-to-image' =
    imageInputImages.length > 0 ? 'image-to-image' : 'text-to-image';

  const modelOptions = useMemo(() => {
    if (mediaType === 'image') {
      return getImageModelOptionsByMode(imageMode);
    }
    if (effectiveBackendSubMode === 'reference-to-video')
      return getVideoModelOptionsForReference();
    if (effectiveBackendSubMode === 'image-to-video')
      return getVideoModelOptionsForImageToVideo();
    // Edit mode shows only models that declare a real `videoEdit`
    // backend — today that's wan2-7. Other tabs continue to use the
    // generic text-to-video allow-list.
    if (videoSubMode === 'edit') {
      return getVideoModelOptionsForEdit();
    }
    return getVideoModelOptions();
  }, [mediaType, imageMode, effectiveBackendSubMode, videoSubMode]);

  const currentImageModelConfig =
    mediaType === 'image' ? getImageModel(selectedModel) : undefined;

  const rawSupportedDurations = currentModelConfig?.supportedDurations || [8];
  const supportedResolutions =
    mediaType === 'image'
      ? currentImageModelConfig?.supportedResolutions || ['1K']
      : currentModelConfig?.supportedResolutions || ['720p'];
  const supportedAspectRatios =
    mediaType === 'image'
      ? currentImageModelConfig?.supportedAspectRatios || ['1:1']
      : currentModelConfig?.supportedAspectRatios || ['16:9'];
  const supportedFormats =
    mediaType === 'image'
      ? currentImageModelConfig?.supportedFormats || ['png']
      : [];
  const maxImageInputs =
    mediaType === 'image' ? currentImageModelConfig?.maxInputImages || 1 : 1;
  const supportsAudio =
    currentModelConfig?.supportsAudio &&
    !!currentModelConfig?.audioPremiumCredits;
  const supportsLastFrame =
    !!currentModelConfig?.imageCapabilities?.flexibleMode;

  // Wan 2.7 R2V (Ali spec): when a reference_video is supplied the
  // allowable output duration is capped at 10s (vs 15s without one).
  // Narrow the picker dynamically so users can't submit an invalid combo.
  const wan27R2VVideoDurationCap =
    selectedModel === 'wan2-7' &&
    videoSubMode === 'reference' &&
    referenceVideos.length > 0;
  const supportedDurations = wan27R2VVideoDurationCap
    ? rawSupportedDurations.filter((d) => d <= 10)
    : rawSupportedDurations;

  const [duration, setDuration] = useState(supportedDurations[0]);

  // If the cap kicks in (user just attached a reference video for wan2-7)
  // and the currently selected duration is now invalid, snap to the
  // largest still-allowed value so the picker stays in sync.
  useEffect(() => {
    if (!supportedDurations.includes(duration) && supportedDurations.length > 0) {
      setDuration(supportedDurations[supportedDurations.length - 1]);
    }
  }, [supportedDurations, duration]);
  const [resolution, setResolution] = useState(supportedResolutions[0]);
  const [aspectRatio, setAspectRatio] = useState(
    supportedAspectRatios[0] || '16:9'
  );
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpg'>('png');

  const creditsCost =
    mediaType === 'video'
      ? calculateVideoCredits(
          currentModelConfig?.id || '',
          duration,
          generateAudio && supportsAudio,
          resolution
        )
      : calculateImageCredits(selectedModel, resolution);

  const selectedModelOption = modelOptions.find(
    (m) => m.value === selectedModel
  );

  // Placeholder follows the current (mediaType, videoSubMode) combo so the
  // hint reflects what the user is about to create — mirrors Wan's UX.
  const promptPlaceholderKey =
    mediaType === 'image'
      ? 'placeholderImage'
      : videoSubMode === 'reference'
        ? 'placeholderVideoReference'
        : videoSubMode === 'edit'
          ? 'placeholderVideoEdit'
          : 'placeholderVideoGenerate';
  const promptPlaceholder = t(promptPlaceholderKey);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleMediaTypeChange = useCallback((next: MediaType) => {
    setMediaType(next);
    setFirstFrameImages([]);
    setLastFrameImages([]);
    setReferenceImages([]);
    setReferenceVideos([]);
    setReferenceAudios([]);
    setImageInputImages([]);
    setEditVideoStub([]);
    setEditImageStub([]);
    if (next === 'image') {
      const defaultImageModel = DEFAULT_IMAGE_MODEL;
      const cfg = getImageModel(defaultImageModel);
      setSelectedModel(defaultImageModel);
      setResolution(cfg?.supportedResolutions?.[0] || '1K');
      setAspectRatio(cfg?.supportedAspectRatios?.[0] || '1:1');
      setOutputFormat((cfg?.supportedFormats?.[0] as 'png' | 'jpg') || 'png');
    } else {
      setSelectedModel(DEFAULT_VIDEO_MODEL);
    }
  }, []);

  const handleVideoSubModeChange = useCallback(
    (mode: VideoSubMode) => {
      setVideoSubMode(mode);
      setFirstFrameImages([]);
      setLastFrameImages([]);
      setReferenceImages([]);
      setReferenceVideos([]);
      setReferenceAudios([]);
      setEditVideoStub([]);
      setEditImageStub([]);
      // Pick a model that supports this sub-mode.
      const options =
        mode === 'reference'
          ? getVideoModelOptionsForReference()
          : mode === 'edit'
            ? getVideoModelOptionsForEdit()
            : getVideoModelOptions();
      if (!options.find((o) => o.value === selectedModel) && options.length > 0)
        setSelectedModel(options[0].value);
    },
    [selectedModel]
  );

  const handleModelChange = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      if (mediaType === 'image') {
        const cfg = getImageModel(modelId);
        if (!cfg) return;
        const resolutions = cfg.supportedResolutions || ['1K'];
        if (!resolutions.includes(resolution)) setResolution(resolutions[0]);
        const ratios = cfg.supportedAspectRatios || ['1:1'];
        if (!ratios.includes(aspectRatio)) setAspectRatio(ratios[0]);
        const fmts = cfg.supportedFormats || ['png'];
        if (!fmts.includes(outputFormat))
          setOutputFormat(fmts[0] as 'png' | 'jpg');
        return;
      }
      const config = getVideoModelConfig(modelId, isImageInput);
      if (!config) return;
      const durations = config.supportedDurations || [8];
      if (!durations.includes(duration)) setDuration(durations[0]);
      const resolutions = config.supportedResolutions || ['720p'];
      const locked = new Set(
        getLockedVideoResolutions(modelId, isSubscribed)
      );
      const firstUnlocked =
        resolutions.find((r) => !locked.has(r)) || resolutions[0];
      if (!resolutions.includes(resolution) || locked.has(resolution)) {
        setResolution(firstUnlocked);
      }
      const ratios = config.supportedAspectRatios || ['16:9'];
      if (!ratios.includes(aspectRatio)) setAspectRatio(ratios[0]);
      if (!config.supportsAudio || !config.audioPremiumCredits)
        setGenerateAudio(false);
    },
    [
      mediaType,
      isImageInput,
      duration,
      resolution,
      aspectRatio,
      outputFormat,
      isSubscribed,
    ]
  );

  const setterFor = (target: UploadTarget) => {
    switch (target) {
      case 'first_frame':
        return setFirstFrameImages;
      case 'last_frame':
        return setLastFrameImages;
      case 'reference':
        return setReferenceImages;
      case 'image_input':
        return setImageInputImages;
      case 'edit_video':
        return setEditVideoStub;
      case 'edit_image':
        return setEditImageStub;
    }
  };

  const maxFor = (target: UploadTarget) => {
    if (target === 'reference') {
      // Reference slot defers to the active model's declared cap (sd2_manxue
      // allows 9, veo3 R2V allows 3). Falls back to 5 for legacy models.
      return currentModelConfig?.imageCapabilities?.maxImages ?? 5;
    }
    if (target === 'image_input') return maxImageInputs;
    // wan2.7-videoedit accepts up to 4 reference images alongside the
    // editable video. Other edit slots stay at 1 (single source video,
    // single placeholder image for not-yet-shipped editors).
    if (target === 'edit_image') return 4;
    return 1;
  };

  const handleFileUpload = useCallback(
    async (files: FileList) => {
      const target = fileInputTargetRef.current;
      const MAX_BYTES = 30 * 1024 * 1024;
      const MAX_MEDIA_SECONDS = 15;
      const MAX_MEDIA_BYTES = 500 * 1024 * 1024;
      const REF_VIDEO_CAP = 3;
      const REF_AUDIO_CAP = 3;

      const showToast = (msg: string) =>
        toast(msg, {
          cancel: { label: t('validation.close'), onClick: () => {} },
          classNames: { title: 'flex-1 text-center' },
        });

      // sd2_manxue reference mode accepts images + videos + audios in
      // one shared upload button. We bucket by MIME and enforce per-
      // bucket count + cumulative duration/size caps. For every other
      // (target, model) combo we fall back to the original single-bucket
      // flow.
      const isMultiBucket =
        target === 'reference' &&
        (selectedModel === 'seedance-2' || selectedModel === 'wan2-7');

      const allowVideoOnly = target === 'edit_video';
      const imageMimes = ['image/jpeg', 'image/png', 'image/webp'];
      const videoMimes = ['video/mp4', 'video/webm', 'video/quicktime'];
      const audioMimes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg'];
      const allowedTypes = isMultiBucket
        ? [...imageMimes, ...videoMimes, ...audioMimes]
        : allowVideoOnly
          ? videoMimes
          : imageMimes;

      // Read a video / audio asset's duration off an in-memory blob URL.
      // Same approach for both — HTMLMediaElement.duration works for
      // <audio> as well.
      const readMediaDuration = (
        f: File,
        kind: 'video' | 'audio'
      ): Promise<number> =>
        new Promise((resolve, reject) => {
          const url = URL.createObjectURL(f);
          const el = document.createElement(kind);
          el.preload = 'metadata';
          el.src = url;
          el.onloadedmetadata = () => {
            const d = el.duration;
            URL.revokeObjectURL(url);
            Number.isFinite(d) ? resolve(d) : reject(new Error('no-duration'));
          };
          el.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('decode'));
          };
        });

      const all = Array.from(files);

      if (isMultiBucket) {
        // Three-bucket bookkeeping. Existing budgets come from current
        // state so multi-step uploads (drop 1 video, then another) get
        // checked cumulatively rather than per-call.
        const imageBudget =
          (currentModelConfig?.imageCapabilities?.maxImages ?? 5) -
          referenceImages.length;
        let videoSlotsLeft = REF_VIDEO_CAP - referenceVideos.length;
        let audioSlotsLeft = REF_AUDIO_CAP - referenceAudios.length;
        let videoDurUsed = referenceVideos.reduce(
          (sum, v) => sum + (v.durationSeconds ?? 0),
          0
        );
        let audioDurUsed = referenceAudios.reduce(
          (sum, a) => sum + (a.durationSeconds ?? 0),
          0
        );
        let videoSizeUsed = referenceVideos.reduce(
          (sum, v) => sum + (v.file?.size ?? 0),
          0
        );
        let audioSizeUsed = referenceAudios.reduce(
          (sum, a) => sum + (a.file?.size ?? 0),
          0
        );
        let imageSlotsLeft = imageBudget;

        const accepted: {
          file: File;
          kind: 'image' | 'video' | 'audio';
          durationSeconds?: number;
        }[] = [];

        for (const f of all) {
          if (imageMimes.includes(f.type)) {
            if (imageSlotsLeft <= 0) {
              showToast(`Already at the image limit — extras ignored.`);
              continue;
            }
            if (f.size > MAX_BYTES) {
              const mb = (f.size / (1024 * 1024)).toFixed(1);
              showToast(`${f.name} is ${mb} MB — image limit is 30 MB.`);
              continue;
            }
            const check = await validateSd2ManxueImage(f);
            if (!check.valid) {
              const msg =
                check.reason === 'dimensions'
                  ? `Image must be 300–6000 px on each side (${check.width}×${check.height}).`
                  : check.reason === 'ratio'
                    ? `Image aspect ratio must be between 0.4 and 2.5 (got ${
                        check.width && check.height
                          ? (check.width / check.height).toFixed(2)
                          : 'invalid'
                      }).`
                    : 'Could not decode image.';
              showToast(msg);
              continue;
            }
            imageSlotsLeft--;
            accepted.push({ file: f, kind: 'image' });
          } else if (videoMimes.includes(f.type)) {
            if (videoSlotsLeft <= 0) {
              showToast(`Up to ${REF_VIDEO_CAP} videos — extras ignored.`);
              continue;
            }
            let dur: number;
            try {
              dur = await readMediaDuration(f, 'video');
            } catch {
              showToast(`Could not read ${f.name} — try a different file.`);
              continue;
            }
            if (videoDurUsed + dur > MAX_MEDIA_SECONDS) {
              showToast(
                `Video duration total would exceed ${MAX_MEDIA_SECONDS}s (current ${videoDurUsed.toFixed(1)}s + ${dur.toFixed(1)}s).`
              );
              continue;
            }
            if (videoSizeUsed + f.size > MAX_MEDIA_BYTES) {
              showToast(`Total video size would exceed 500 MB.`);
              continue;
            }
            videoSlotsLeft--;
            videoDurUsed += dur;
            videoSizeUsed += f.size;
            accepted.push({ file: f, kind: 'video', durationSeconds: dur });
          } else if (audioMimes.includes(f.type)) {
            if (audioSlotsLeft <= 0) {
              showToast(`Up to ${REF_AUDIO_CAP} audios — extras ignored.`);
              continue;
            }
            let dur: number;
            try {
              dur = await readMediaDuration(f, 'audio');
            } catch {
              showToast(`Could not read ${f.name} — try a different file.`);
              continue;
            }
            if (audioDurUsed + dur > MAX_MEDIA_SECONDS) {
              showToast(
                `Audio duration total would exceed ${MAX_MEDIA_SECONDS}s (current ${audioDurUsed.toFixed(1)}s + ${dur.toFixed(1)}s).`
              );
              continue;
            }
            if (audioSizeUsed + f.size > MAX_MEDIA_BYTES) {
              showToast(`Total audio size would exceed 500 MB.`);
              continue;
            }
            audioSlotsLeft--;
            audioDurUsed += dur;
            audioSizeUsed += f.size;
            accepted.push({ file: f, kind: 'audio', durationSeconds: dur });
          } else {
            showToast(
              `Unsupported file: ${f.type || 'unknown'}. Use image, mp4/webm/mov, or mp3/wav.`
            );
          }
        }

        // Build placeholder entries, route to the right setter, and
        // kick off uploads in parallel — same lifecycle as the legacy
        // single-bucket path, just split three ways.
        const uploadOne = async (
          entry: UploadedImage,
          setter: typeof setReferenceImages
        ) => {
          try {
            const result = await uploadWithCaptcha(entry.file, 'image-input');
            setter((prev) =>
              prev.map((i) =>
                i.id === entry.id
                  ? { ...i, r2Url: result.url, uploading: false }
                  : i
              )
            );
          } catch {
            setter((prev) =>
              prev.map((i) =>
                i.id === entry.id
                  ? { ...i, uploading: false, error: 'Upload failed' }
                  : i
              )
            );
          }
        };

        for (const a of accepted) {
          const entry: UploadedImage = {
            id: crypto.randomUUID(),
            file: a.file,
            previewUrl: URL.createObjectURL(a.file),
            uploading: true,
            kind: a.kind,
            durationSeconds: a.durationSeconds,
          };
          if (a.kind === 'image') {
            setReferenceImages((prev) => [...prev, entry]);
            uploadOne(entry, setReferenceImages);
          } else if (a.kind === 'video') {
            setReferenceVideos((prev) => [...prev, entry]);
            uploadOne(entry, setReferenceVideos);
          } else {
            setReferenceAudios((prev) => [...prev, entry]);
            uploadOne(entry, setReferenceAudios);
          }
        }
        return;
      }

      // ── Single-bucket path (everything that isn't sd2 reference) ──
      const max = maxFor(target);
      if (all.length > max) {
        showToast(
          allowVideoOnly
            ? `Only ${max} video${max > 1 ? 's' : ''} allowed — extras ignored.`
            : `Only ${max} image${max > 1 ? 's' : ''} allowed — extras ignored.`
        );
      }
      const candidateFiles = all.slice(0, max);

      const validFiles: File[] = [];
      const videoDurations = new Map<File, number>();
      const needsSd2Check =
        selectedModel === 'seedance-2' &&
        !allowVideoOnly &&
        (target === 'first_frame' || target === 'last_frame');
      for (const f of candidateFiles) {
        if (!allowedTypes.includes(f.type)) {
          showToast(
            allowVideoOnly
              ? `Unsupported video format: ${f.type || 'unknown'}. Use mp4 / webm / mov.`
              : `Unsupported image format: ${f.type || 'unknown'}. Use jpg / png / webp.`
          );
          continue;
        }
        if (f.size > MAX_BYTES) {
          const mb = (f.size / (1024 * 1024)).toFixed(1);
          showToast(`${f.name} is ${mb} MB — limit is 30 MB.`);
          continue;
        }
        if (allowVideoOnly) {
          try {
            const dur = await readMediaDuration(f, 'video');
            if (dur > MAX_MEDIA_SECONDS) {
              showToast(
                `${f.name} is ${dur.toFixed(1)}s — limit is ${MAX_MEDIA_SECONDS}s.`
              );
              continue;
            }
            // Stash on a side map so the newImages mapper below can read it
            // back — billing for wan27-videoedit needs input video duration.
            videoDurations.set(f, dur);
          } catch {
            showToast(`Could not read ${f.name} — try a different file.`);
            continue;
          }
          validFiles.push(f);
          continue;
        }
        if (!needsSd2Check) {
          validFiles.push(f);
          continue;
        }
        const check = await validateSd2ManxueImage(f);
        if (check.valid) {
          validFiles.push(f);
        } else {
          const msg =
            check.reason === 'dimensions'
              ? `Image must be 300–6000 px on each side (${check.width}×${check.height}).`
              : check.reason === 'ratio'
                ? `Image aspect ratio must be between 0.4 and 2.5 (got ${
                    check.width && check.height
                      ? (check.width / check.height).toFixed(2)
                      : 'invalid'
                  }).`
                : 'Could not decode image.';
          showToast(msg);
        }
      }

      const newImages: UploadedImage[] = validFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        uploading: true,
        durationSeconds: videoDurations.get(file),
      }));

      const setter = setterFor(target);
      setter((prev) => [...prev, ...newImages]);

      for (const img of newImages) {
        try {
          const result = await uploadWithCaptcha(img.file, 'image-input');
          setter((prev) =>
            prev.map((i) =>
              i.id === img.id
                ? { ...i, r2Url: result.url, uploading: false }
                : i
            )
          );
        } catch {
          setter((prev) =>
            prev.map((i) =>
              i.id === img.id
                ? { ...i, uploading: false, error: 'Upload failed' }
                : i
            )
          );
        }
      }
    },
    [
      uploadWithCaptcha,
      selectedModel,
      t,
      currentModelConfig,
      referenceImages,
      referenceVideos,
      referenceAudios,
    ]
  );

  const removeImage = useCallback((id: string, target: UploadTarget) => {
    const setter = setterFor(target);
    setter((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  // sd2_manxue reference mode tracks images / videos / audios in
  // separate buckets; chips need to remove from the matching one.
  const removeReferenceMedia = useCallback(
    (id: string, kind: 'image' | 'video' | 'audio') => {
      const setter =
        kind === 'image'
          ? setReferenceImages
          : kind === 'video'
            ? setReferenceVideos
            : setReferenceAudios;
      setter((prev) => {
        const item = prev.find((i) => i.id === id);
        if (item) URL.revokeObjectURL(item.previewUrl);
        return prev.filter((i) => i.id !== id);
      });
    },
    []
  );

  // Clicking an upload slot opens the asset picker — user can either
  // upload a new file or pick from their previous generations (mirrors
  // image-website's CompactImageInput → ImagePickerModal flow).
  // Anonymous users are redirected to the login modal: uploads write to
  // the user's R2 bucket and need an authenticated session.
  const triggerUpload = useCallback(
    (target: UploadTarget) => {
      if (!session?.user) {
        onRequireAuth?.();
        return;
      }
      fileInputTargetRef.current = target;
      setPickerOpen(true);
    },
    [session?.user, onRequireAuth]
  );

  // Asset picker → "Upload" tile: open the hidden native file input.
  const handlePickerUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ── Role band handlers ────────────────────────────────────────────────
  // User-uploaded roles come from the DB (gated by login) and sit first;
  // hardcoded presets follow, so the most personal entries are nearest
  // the cursor.
  const { data: dbRoles } = useRoles({ enabled: !!session?.user });
  const allRoles = useMemo<Role[]>(
    () => [
      ...(dbRoles ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        avatarUrl: r.thumbUrl,
        imageUrl: r.imageUrl,
        isUserUploaded: true,
        moderationStatus: r.moderation?.seedance?.status,
        // Only surface the assetId once moderation cleared — submitting
        // `asset://` for a pending/flagged asset would 4xx upstream.
        seedanceAssetId:
          r.moderation?.seedance?.status === 'safe'
            ? r.moderation.seedance.externalAssetId
            : undefined,
      })),
      ...PRESET_ROLES,
    ],
    [dbRoles]
  );

  // Selecting a role pushes it into the reference slot (the backend maps
  // these to `reference_image`) and auto-switches to Reference sub-mode
  // so the user sees the resulting chip immediately. The role's metadata
  // rides along so the chip can render avatar + name.
  const handleSelectRole = useCallback((role: Role) => {
    setVideoSubMode('reference');
    setReferenceImages((prev) => {
      if (prev.length >= 5) return prev;
      if (prev.some((r) => r.roleId === role.id)) return prev;
      const entry: UploadedImage = {
        id: crypto.randomUUID(),
        file: null as unknown as File,
        previewUrl: role.imageUrl,
        r2Url: role.imageUrl,
        uploading: false,
        roleName: role.name,
        roleAvatarUrl: role.avatarUrl,
        roleId: role.id,
        seedanceAssetId: role.seedanceAssetId,
      };
      return [...prev, entry];
    });
  }, []);

  // After a successful upload + create, immediately select the new role
  // so it shows up in the prompt chips without a second click. The
  // `useRoles` query already has the new row in its cache (the mutation
  // primes it), so the band re-renders next tick.
  const handleAddRole = useCallback(
    (role: Role) => {
      handleSelectRole(role);
    },
    [handleSelectRole]
  );

  const selectedRoleIds = useMemo(
    () => referenceImages.map((i) => i.roleId).filter((x): x is string => !!x),
    [referenceImages]
  );

  // Asset picker → click an existing asset: skip the upload step and
  // push it into the slot with r2Url already set.
  const handleAssetSelect = useCallback((assetUrl: string) => {
    const target = fileInputTargetRef.current;
    const setter = setterFor(target);
    setter((prev) => {
      if (prev.length >= maxFor(target)) return prev;
      const next: UploadedImage = {
        id: crypto.randomUUID(),
        // No File — the asset is already in R2.
        file: null as unknown as File,
        previewUrl: assetUrl,
        r2Url: assetUrl,
        uploading: false,
      };
      return [...prev, next];
    });
  }, []);

  const handleGenerate = useCallback(() => {
    if (isGenerating) return;
    const validationToast = (message: string) =>
      toast(message, {
        cancel: { label: t('validation.close'), onClick: () => {} },
        classNames: { title: 'flex-1 text-center' },
      });

    if (videoSubMode === 'edit' && mediaType === 'video') {
      // wan2-7 and gemini-omni both route to the Wan 2.7 video-edit
      // backend (gemini-omni is a marketing alias). Anything else hasn't
      // shipped an edit endpoint yet.
      const editCapable =
        selectedModel === 'wan2-7' || selectedModel === 'gemini-omni';
      if (!editCapable) {
        validationToast('Video editing coming soon');
        return;
      }
      if (!prompt.trim()) {
        validationToast(t('validation.promptRequired'));
        return;
      }
      const editVideo = editVideoStub[0];
      if (!editVideo?.r2Url) {
        validationToast(t('validation.referenceRequired'));
        return;
      }
      const allEditMedia = [...editVideoStub, ...editImageStub];
      if (allEditMedia.some((m) => m.uploading)) {
        validationToast(t('validation.uploading'));
        return;
      }
      const refUrls = editImageStub
        .map((img) => img.r2Url)
        .filter((u): u is string => !!u);
      onGenerate({
        mediaType: 'video',
        model: selectedModel,
        prompt: prompt.trim(),
        video_url: editVideo.r2Url,
        image_urls: refUrls.length > 0 ? refUrls : undefined,
        image_roles:
          refUrls.length > 0 ? refUrls.map(() => 'reference_image') : undefined,
        aspect_ratio: aspectRatio,
        duration,
        resolution,
        generationType: 'VIDEO_EDIT',
        inputVideoDurationSeconds: editVideo.durationSeconds,
      });
      return;
    }

    if (mediaType === 'image') {
      if (!prompt.trim()) {
        validationToast(t('validation.promptRequired'));
        return;
      }
      if (imageInputImages.some((img) => img.uploading)) {
        validationToast(t('validation.uploading'));
        return;
      }
      const urls = imageInputImages
        .map((img) => img.r2Url)
        .filter((u): u is string => !!u);
      onGenerate({
        mediaType: 'image',
        model: selectedModel,
        prompt: prompt.trim(),
        image_urls: urls.length > 0 ? urls : undefined,
        aspect_ratio: aspectRatio,
        duration: 0,
        resolution,
        generationType: urls.length > 0 ? 'IMAGE_2_IMAGE' : 'TEXT_2_IMAGE',
        output_format: outputFormat,
      });
      return;
    }

    if (
      !prompt.trim() &&
      videoSubMode === 'generate' &&
      firstFrameImages.length === 0
    ) {
      validationToast(t('validation.promptRequired'));
      return;
    }
    if (
      videoSubMode === 'reference' &&
      referenceImages.length === 0 &&
      referenceVideos.length === 0 &&
      referenceAudios.length === 0
    ) {
      validationToast(t('validation.referenceRequired'));
      return;
    }

    const allMedia = [
      ...firstFrameImages,
      ...lastFrameImages,
      ...referenceImages,
      ...referenceVideos,
      ...referenceAudios,
    ];
    if (allMedia.some((img) => img.uploading)) {
      validationToast(t('validation.uploading'));
      return;
    }

    let image_urls: string[] | undefined;
    let image_roles:
      | ('first_frame' | 'last_frame' | 'reference_image')[]
      | undefined;
    let referenceVideoUrls: string[] | undefined;
    let referenceAudioUrls: string[] | undefined;
    let generationType = 'TEXT_2_VIDEO';

    if (videoSubMode === 'generate' && firstFrameImages.length > 0) {
      const urls: string[] = [];
      const roles: ('first_frame' | 'last_frame' | 'reference_image')[] = [];
      // Seedance 2 wants `asset://{assetId}` for moderation-cleared
      // role references. A frame that came from a role selection carries
      // a seedanceAssetId; raw uploads do not, so they fall back to r2Url.
      const useAssetProtocol = selectedModel === 'seedance-2';
      const encode = (img: UploadedImage) =>
        useAssetProtocol && img.seedanceAssetId
          ? `asset://${img.seedanceAssetId}`
          : img.r2Url;
      for (const img of firstFrameImages) {
        const value = encode(img);
        if (value) {
          urls.push(value);
          roles.push('first_frame');
        }
      }
      const hasLast = supportsLastFrame && lastFrameImages.length > 0;
      if (hasLast) {
        for (const img of lastFrameImages) {
          const value = encode(img);
          if (value) {
            urls.push(value);
            roles.push('last_frame');
          }
        }
      }
      image_urls = urls.length > 0 ? urls : undefined;
      image_roles = roles.length > 0 ? roles : undefined;
      generationType = hasLast
        ? 'FIRST_AND_LAST_FRAMES_2_VIDEO'
        : 'IMAGE_2_VIDEO';
    } else if (videoSubMode === 'reference') {
      const urls: string[] = [];
      const roles: ('first_frame' | 'last_frame' | 'reference_image')[] = [];
      // Seedance 2 wants `asset://{assetId}` for moderation-cleared
      // role references (per sd2_manxue API spec). Other models still
      // get the raw R2 url because they don't understand the protocol.
      const useAssetProtocol = selectedModel === 'seedance-2';
      const encode = (img: UploadedImage) =>
        useAssetProtocol && img.seedanceAssetId
          ? `asset://${img.seedanceAssetId}`
          : img.r2Url;
      for (const img of referenceImages) {
        const value = encode(img);
        if (value) {
          urls.push(value);
          roles.push('reference_image');
        }
      }
      // Optional first-frame "Frame" slot for the reference flow.
      for (const img of firstFrameImages) {
        const value = encode(img);
        if (value) {
          urls.push(value);
          roles.push('first_frame');
        }
      }
      image_urls = urls.length > 0 ? urls : undefined;
      image_roles = roles.length > 0 ? roles : undefined;
      generationType = 'REFERENCE_2_VIDEO';

      // sd2_manxue accepts referenceVideos + referenceAudios as
      // separate top-level arrays. Other providers ignore these fields.
      const vUrls = referenceVideos
        .map((v) => v.r2Url)
        .filter((u): u is string => !!u);
      const aUrls = referenceAudios
        .map((a) => a.r2Url)
        .filter((u): u is string => !!u);
      if (vUrls.length > 0) referenceVideoUrls = vUrls;
      if (aUrls.length > 0) referenceAudioUrls = aUrls;
    }

    const inputVideoDurationSeconds =
      generationType === 'REFERENCE_2_VIDEO'
        ? referenceVideos.reduce(
            (sum, v) => sum + (v.durationSeconds ?? 0),
            0
          ) || undefined
        : undefined;

    onGenerate({
      mediaType: 'video',
      model: selectedModel,
      prompt: prompt.trim(),
      image_urls,
      image_roles,
      aspect_ratio: aspectRatio,
      duration,
      resolution,
      generationType,
      generate_audio: supportsAudio ? generateAudio : undefined,
      referenceVideos: referenceVideoUrls,
      referenceAudios: referenceAudioUrls,
      inputVideoDurationSeconds,
    });
  }, [
    isGenerating,
    mediaType,
    videoSubMode,
    prompt,
    firstFrameImages,
    lastFrameImages,
    referenceImages,
    referenceVideos,
    referenceAudios,
    imageInputImages,
    editVideoStub,
    editImageStub,
    outputFormat,
    supportsLastFrame,
    selectedModel,
    aspectRatio,
    duration,
    resolution,
    generateAudio,
    supportsAudio,
    onGenerate,
    t,
  ]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const canGenerate =
    !isGenerating &&
    (prompt.trim().length > 0 ||
      firstFrameImages.length > 0 ||
      referenceImages.length > 0 ||
      imageInputImages.length > 0 ||
      editVideoStub.length > 0);

  // ── Upload tile components ────────────────────────────────────────────
  // Square dashed tile — used for Video Generate (First / Last frame).
  // Mirrors image-website's CompactImageInput visual.
  const renderTile = (
    images: UploadedImage[],
    target: UploadTarget,
    label: string,
    tilt: 'left' | 'right' | 'none' = 'none'
  ) => {
    const first = images[0];
    return (
      <div className="relative">
        {first ? (
          <div className="group relative h-14 w-12 shrink-0 overflow-hidden rounded-md bg-muted shadow-sm">
            <img
              src={first.previewUrl}
              alt={label}
              className="size-full object-cover"
            />
            {first.uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="size-4 animate-spin text-white" />
              </div>
            )}
            {!first.uploading && (
              <button
                type="button"
                onClick={() => removeImage(first.id, target)}
                aria-label="Remove"
                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="size-4 text-white" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => triggerUpload(target)}
            aria-label={label}
            className={cn(
              'flex h-14 w-12 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed border-foreground/40 bg-foreground/[0.06] transition-transform hover:scale-105 hover:border-foreground/60 hover:bg-foreground/[0.1]',
              tilt === 'left' && '-rotate-3',
              tilt === 'right' && 'rotate-3'
            )}
          >
            <Plus className="size-4 text-muted-foreground" />
            <span className="text-[10px] leading-none text-muted-foreground">
              {label}
            </span>
          </button>
        )}
      </div>
    );
  };

  // Pill button — used for Reference / Edit slots (rounded, label inline).
  const renderUploadPill = (
    images: UploadedImage[],
    target: UploadTarget,
    label: string,
    opts: { hideCount?: boolean } = {}
  ) => {
    const count = images.length;
    const max = maxFor(target);
    return (
      <button
        type="button"
        onClick={() => triggerUpload(target)}
        aria-label={label}
        disabled={count >= max}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.06] px-3.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="size-3.5" />
        <span>{label}</span>
        {!opts.hideCount && count > 0 && (
          <span className="ml-0.5 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] tabular-nums">
            {count}/{max}
          </span>
        )}
      </button>
    );
  };

  const renderUploadSlots = () => {
    if (mediaType === 'image') {
      // Multi-image strip (Kie nano-banana supports up to 8 / 14 inputs).
      return (
        <div className="flex flex-wrap items-center gap-2">
          {imageInputImages.map((img) => (
            <div
              key={img.id}
              className="group relative h-14 w-12 shrink-0 overflow-hidden rounded-md bg-muted shadow-sm"
            >
              <img
                src={img.previewUrl}
                alt=""
                className="size-full object-cover"
              />
              {img.uploading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="size-4 animate-spin text-white" />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => removeImage(img.id, 'image_input')}
                  aria-label="Remove"
                  className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="size-4 text-white" />
                </button>
              )}
            </div>
          ))}
          {imageInputImages.length < maxImageInputs && (
            <button
              type="button"
              onClick={() => triggerUpload('image_input')}
              aria-label="Add image"
              className="flex h-14 w-12 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed border-foreground/40 bg-foreground/[0.06] transition-transform hover:scale-105 hover:border-foreground/60 hover:bg-foreground/[0.1]"
            >
              <Plus className="size-4 text-muted-foreground" />
              <span className="text-[10px] leading-none text-muted-foreground">
                Image
              </span>
            </button>
          )}
        </div>
      );
    }
    if (videoSubMode === 'generate') {
      return (
        <div className="flex items-center gap-2">
          {renderTile(firstFrameImages, 'first_frame', 'First', 'left')}
          <ArrowLeftRight
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground/60"
          />
          {renderTile(lastFrameImages, 'last_frame', 'Last', 'right')}
        </div>
      );
    }
    if (videoSubMode === 'reference') {
      const refCount =
        referenceImages.length +
        referenceVideos.length +
        referenceAudios.length;
      // Multi-bucket reference (image + video + audio) for models whose
      // backend accepts all three. Other models fall back to the legacy
      // image-only pill.
      const isMultiBucketRef =
        selectedModel === 'seedance-2' || selectedModel === 'wan2-7';
      const imgCap = currentModelConfig?.imageCapabilities?.maxImages ?? 5;
      const multiBucketAllFull =
        referenceImages.length >= imgCap &&
        referenceVideos.length >= 3 &&
        referenceAudios.length >= 3;
      return (
        <div className="flex items-center gap-2">
          {isMultiBucketRef ? (
            <button
              type="button"
              onClick={() => triggerUpload('reference')}
              aria-label="Reference"
              disabled={multiBucketAllFull}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.06] px-3.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="size-3.5" />
              <span>{refCount === 0 ? 'Reference' : 'Add'}</span>
              {refCount > 0 && (
                <span className="ml-0.5 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] tabular-nums">
                  {refCount}
                </span>
              )}
            </button>
          ) : (
            renderUploadPill(
              referenceImages,
              'reference',
              refCount === 0 ? 'Reference' : 'Add',
              { hideCount: true }
            )
          )}
          <span aria-hidden className="h-6 w-px bg-foreground/15" />
          {renderUploadPill(firstFrameImages, 'first_frame', 'Frame')}
        </div>
      );
    }
    if (videoSubMode === 'edit') {
      const imgLabel = editImageStub.length === 0 ? 'Image' : 'Add';
      return (
        <div className="flex items-center gap-2">
          {renderUploadPill(editVideoStub, 'edit_video', 'Video')}
          <span aria-hidden className="h-6 w-px bg-foreground/15" />
          {renderUploadPill(editImageStub, 'edit_image', imgLabel)}
        </div>
      );
    }
    return null;
  };

  // ── Right-side controls (model + settings popover) ────────────────────
  const modelPill = (
    <Select value={selectedModel} onValueChange={handleModelChange}>
      <SelectTrigger
        className={cn(PILL, 'max-w-[140px] sm:max-w-none')}
        aria-label={t('aiModel')}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {selectedModelOption?.logo ? (
            <img
              src={selectedModelOption.logo}
              alt=""
              className="size-3.5 shrink-0 rounded-full"
            />
          ) : selectedModelOption?.icon ? (
            <span aria-hidden className="text-sm leading-none">
              {selectedModelOption.icon}
            </span>
          ) : null}
          <span className="truncate">
            {selectedModelOption?.label || selectedModel}
          </span>
        </span>
      </SelectTrigger>
      <SelectContent side="top" align="end" sideOffset={8}>
        {modelOptions.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            disabled={(opt as { comingSoon?: boolean }).comingSoon}
          >
            <span className="flex w-full items-center gap-2">
              {opt.logo ? (
                <img src={opt.logo} alt="" className="size-4 rounded-full" />
              ) : opt.icon ? (
                <span aria-hidden className="text-base leading-none">
                  {opt.icon}
                </span>
              ) : null}
              <span>{opt.label}</span>
              {(opt as { comingSoon?: boolean }).comingSoon && (
                <span className="ml-auto rounded-full border bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Soon
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  // Combined settings popover (resolution + aspect + duration + audio).
  const settingsPill = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            PILL,
            'inline-flex items-center gap-1 text-foreground/80 hover:bg-secondary'
          )}
          aria-label="Settings"
        >
          {/* On mobile, only resolution is shown to keep the pill compact;
           * full segments come back at ≥sm. The popover still exposes every
           * setting either way. */}
          <span className="inline-block min-w-[3.5ch] text-center tabular-nums">
            {resolution}
          </span>
          <span aria-hidden className="hidden text-muted-foreground/50 sm:inline">
            |
          </span>
          <span className="hidden min-w-[4ch] text-center tabular-nums sm:inline-block">
            {aspectRatio}
          </span>
          {mediaType === 'video' && (
            <>
              <span aria-hidden className="hidden text-muted-foreground/50 sm:inline">
                |
              </span>
              <span className="hidden min-w-[2.5ch] text-center tabular-nums sm:inline-block">
                {duration === 0 ? 'Match' : `${duration}s`}
              </span>
            </>
          )}
          <SlidersHorizontal className="ml-0.5 size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-72 space-y-4 p-4"
      >
        {/* Resolution */}
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t('resolution')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {supportedResolutions.map((r) => {
              const videoPremium =
                mediaType === 'video' &&
                getLockedVideoResolutions(selectedModel, false).includes(r);
              const imagePremium = mediaType === 'image' && r === '4K';
              const isPremium = videoPremium || imagePremium;
              const locked = isPremium && !isSubscribed;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    if (locked) {
                      openSubscriptionDialog(`${r} Resolution`);
                      return;
                    }
                    setResolution(r);
                  }}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs',
                    resolution === r
                      ? 'border-foreground/20 bg-foreground/10 text-foreground'
                      : 'border-transparent bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.1]'
                  )}
                >
                  <span>{r}</span>
                  {isPremium && (
                    <Crown
                      aria-hidden
                      className={cn(
                        'size-3',
                        locked ? 'text-amber-500' : 'text-amber-400'
                      )}
                      strokeWidth={2.5}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Aspect ratio */}
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t('aspectRatio')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {supportedAspectRatios.map((ar) => (
              <button
                key={ar}
                type="button"
                onClick={() => setAspectRatio(ar)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
                  aspectRatio === ar
                    ? 'border-foreground/20 bg-foreground/10 text-foreground'
                    : 'border-transparent bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.1]'
                )}
              >
                <AspectRatioIcon ratio={ar} />
                <span>{ar}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Duration (video only) */}
        {mediaType === 'video' && supportedDurations.length > 1 && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">
              {t('duration')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {supportedDurations.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs',
                    duration === d
                      ? 'border-foreground/20 bg-foreground/10 text-foreground'
                      : 'border-transparent bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.1]'
                  )}
                >
                  {d === 0 ? 'Match input' : `${d}s`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Output format (image only) */}
        {mediaType === 'image' && supportedFormats.length > 1 && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">
              Format
            </div>
            <div className="flex flex-wrap gap-1.5">
              {supportedFormats.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setOutputFormat(f as 'png' | 'jpg')}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs uppercase',
                    outputFormat === f
                      ? 'border-foreground/20 bg-foreground/10 text-foreground'
                      : 'border-transparent bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.1]'
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Audio (video only) */}
        {mediaType === 'video' && supportsAudio && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Audio
            </span>
            <Switch
              checked={generateAudio}
              onCheckedChange={setGenerateAudio}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );

  // ── Collapsed pill (matches Wan's compact bar) ────────────────────────
  const collapsedPill = (
    <div
      onClick={() => setExpanded(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setExpanded(true);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={promptPlaceholder}
      className="group/pill relative isolate flex w-full cursor-text items-center gap-3 rounded-full border border-white/40 bg-background/75 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-1px_0_rgba(0,0,0,0.05)] backdrop-blur-3xl backdrop-saturate-200 transition-colors hover:border-white/55 dark:border-white/15 dark:bg-background/60 dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.2)] dark:hover:border-white/25"
    >
      <BorderGlow radius="rounded-full" />
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06] text-muted-foreground dark:bg-white/[0.06]"
      >
        <ImagePlus className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {prompt || promptPlaceholder}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleGenerate();
        }}
        disabled={!canGenerate}
        aria-label={isGenerating ? t('generating') : t('generate')}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.08] px-3 text-xs font-medium text-foreground/90 transition-colors hover:bg-foreground/[0.12] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
      >
        {isGenerating ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Sparkles className="size-3.5" />
        )}
        <span className="tabular-nums">{creditsCost}</span>
      </button>
    </div>
  );

  const overlay = expanded || floating;

  // ── Expanded panel (matches simplified Wan layout) ────────────────────
  const expandedPanel = (
    <div className="flex flex-col gap-2">
      {mediaType === 'video' && (
        <RoleBand
          roles={allRoles}
          selectedRoleIds={selectedRoleIds}
          onSelectRole={handleSelectRole}
          onAddRole={handleAddRole}
          upload={uploadWithCaptcha}
        />
      )}
      <div className="relative isolate flex gap-2.5 rounded-2xl border border-white/40 bg-background/75 p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_0_rgba(0,0,0,0.06)] backdrop-blur-3xl backdrop-saturate-200 dark:border-white/15 dark:bg-background/60 dark:shadow-[0_20px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.25)]">
        <BorderGlow radius="rounded-2xl" />

        {/* Left rail: media type (video / image). Default = narrow column
         * with icons only; hover expands into a floating glass strip with
         * labels, overlaying the main content so the layout doesn't shift.
         * Outer is `self-start` so the rail only takes its content's height
         * — the area below the icons is just panel bg, no empty column. */}
        <div className="relative w-9 shrink-0 self-start">
          <div
            className={cn(
              'group/rail absolute left-0 top-0 z-10 flex w-9 flex-col gap-1 overflow-hidden rounded-xl transition-[width,padding,background-color,box-shadow] duration-200 ease-out',
              'hover:w-32 hover:bg-background/85 hover:p-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.18)] hover:backdrop-blur-2xl hover:backdrop-saturate-200',
              'dark:hover:bg-background/75 dark:hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)]'
            )}
          >
            {[
              { id: 'video' as const, icon: VideoIcon, label: 'Video' },
              { id: 'image' as const, icon: ImageIcon, label: 'Image' },
            ].map(({ id, icon: Icon, label }) => {
              const active = mediaType === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleMediaTypeChange(id)}
                  aria-pressed={active}
                  aria-label={label}
                  className={cn(
                    'flex h-9 w-full shrink-0 items-center gap-2 rounded-lg px-2.5 transition-colors',
                    active
                      ? 'bg-foreground/10 text-foreground'
                      : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground'
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Top row: sub-mode dropdown (video only) | model + settings.
           * On mobile the right-side controls wrap to a second line so the
           * model pill doesn't get pushed off-screen. In image mode there's
           * no sub-mode select, so the cluster anchors left instead of
           * leaving a dead gap on the left edge. */}
          <div
            className={cn(
              'flex flex-wrap items-center gap-2',
              mediaType === 'video' ? 'justify-between' : 'justify-end'
            )}
          >
            {mediaType === 'video' && (
              <div className="flex min-w-0 items-center">
                <Select
                  value={videoSubMode}
                  onValueChange={(v) =>
                    handleVideoSubModeChange(v as VideoSubMode)
                  }
                >
                  <SelectTrigger
                    className={cn(
                      PILL,
                      'gap-1 pr-2 font-semibold text-foreground'
                    )}
                    aria-label="Sub-mode"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent side="top" align="start" sideOffset={8}>
                    <SelectItem value="generate">Generate</SelectItem>
                    <SelectItem value="reference">Reference</SelectItem>
                    <SelectItem value="edit">Edit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              {modelPill}
              {settingsPill}
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close"
                className="ml-0.5 inline-flex size-6 items-center justify-center rounded-full border border-foreground/10 bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/[0.1] hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Reference chip row (above prompt) — surfaces selected references
           * inline so the panel doesn't need 5 large tiles at the bottom. */}
          {videoSubMode === 'reference' &&
            (referenceImages.length > 0 ||
              referenceVideos.length > 0 ||
              referenceAudios.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {referenceImages.map((img, idx) => (
                  <RoleChip
                    key={img.id}
                    name={img.roleName || `Image ${idx + 1}`}
                    avatarUrl={img.roleAvatarUrl || img.previewUrl}
                    onRemove={() =>
                      img.kind === 'image' || !img.kind
                        ? removeImage(img.id, 'reference')
                        : removeReferenceMedia(img.id, 'image')
                    }
                  />
                ))}
                {referenceVideos.map((v, idx) => (
                  <MediaChip
                    key={v.id}
                    kind="video"
                    label={
                      v.durationSeconds
                        ? `Video ${idx + 1} · ${v.durationSeconds.toFixed(1)}s`
                        : `Video ${idx + 1}`
                    }
                    uploading={v.uploading}
                    error={v.error}
                    onRemove={() => removeReferenceMedia(v.id, 'video')}
                  />
                ))}
                {referenceAudios.map((a, idx) => (
                  <MediaChip
                    key={a.id}
                    kind="audio"
                    label={
                      a.durationSeconds
                        ? `Audio ${idx + 1} · ${a.durationSeconds.toFixed(1)}s`
                        : `Audio ${idx + 1}`
                    }
                    uploading={a.uploading}
                    error={a.error}
                    onRemove={() => removeReferenceMedia(a.id, 'audio')}
                  />
                ))}
              </div>
            )}

          {/* Edit-mode chip row — mirror the reference chip row so users can
           * see and individually remove the editable video + reference images. */}
          {videoSubMode === 'edit' &&
            (editVideoStub.length > 0 || editImageStub.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {editVideoStub.map((v, idx) => (
                  <MediaChip
                    key={v.id}
                    kind="video"
                    label={
                      v.durationSeconds
                        ? `Video ${idx + 1} · ${v.durationSeconds.toFixed(1)}s`
                        : `Video ${idx + 1}`
                    }
                    uploading={v.uploading}
                    error={v.error}
                    onRemove={() => removeImage(v.id, 'edit_video')}
                  />
                ))}
                {editImageStub.map((img, idx) => (
                  <RoleChip
                    key={img.id}
                    name={`Image ${idx + 1}`}
                    avatarUrl={img.previewUrl}
                    onRemove={() => removeImage(img.id, 'edit_image')}
                  />
                ))}
              </div>
            )}

          {/* Prompt */}
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={promptPlaceholder}
            maxLength={4000}
            className="min-h-[44px] resize-none border-none bg-transparent p-0 text-sm leading-snug shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
          />

          {/* Bottom row: upload slots | Generate */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {renderUploadSlots()}
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              aria-label={isGenerating ? t('generating') : t('generate')}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-foreground/30"
            >
              {isGenerating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              <span className="tabular-nums">{creditsCost}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const pickerAssetType: 'image' | 'video' =
    fileInputTargetRef.current === 'edit_video' ? 'video' : 'image';

  return (
    <>
      {captchaDialog}
      {session?.user && (
        <AssetPickerModal
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onAssetSelect={handleAssetSelect}
          onUploadClick={handlePickerUpload}
          assetType={pickerAssetType}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={
          videoSubMode === 'reference' && selectedModel === 'seedance-2'
            ? 'image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp3,audio/wav,audio/ogg'
            : 'image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime'
        }
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFileUpload(e.target.files);
          e.target.value = '';
        }}
      />

      <div ref={slotRef} className="mx-auto w-full max-w-[600px]">
        {overlay ? <div className="h-[60px] sm:h-[64px]" /> : collapsedPill}
      </div>

      {overlay && (
        <div className="fixed inset-x-0 bottom-3 z-40 px-4 sm:bottom-4">
          <div
            className={cn(
              'mx-auto w-full',
              expanded ? 'max-w-[900px]' : 'max-w-[600px]'
            )}
          >
            {expanded ? expandedPanel : collapsedPill}
          </div>
        </div>
      )}
    </>
  );
}
