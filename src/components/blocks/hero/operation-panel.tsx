'use client';

import {
  getAssetMediaUrl,
  getAssetThumbnailUrl,
} from '@/assets/business/asset-mapper';
import type { Asset, AssetType } from '@/assets/types';
import {
  ReferencePromptEditor,
  serializePromptForBackend,
} from '@/components/blocks/hero/reference-prompt-editor';
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
import { useAssets } from '@/hooks/use-assets';
import { useCaptchaGatedUpload } from '@/hooks/use-captcha-gated-upload';
import { useCurrentPlan } from '@/hooks/use-payment';
import { useRoles } from '@/hooks/use-roles';
import {
  DEFAULT_IMAGE_MODEL,
  calculateImageCredits,
  getImageModel,
  getImageModelOptionsByMode,
} from '@/image/config/image-models';
import { authClient } from '@/lib/auth-client';
import {
  validateSeedanceImage,
  validateSeedanceVideo,
  validateWanReferenceImage,
  validateWanReferenceVideo,
} from '@/lib/image-resize';
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
  AtSign,
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

/** Insert a chip marker into a prompt string. If the prompt ends with a
 *  literal `@xxx` mention (no whitespace after the `@`), replace it; else
 *  append a marker at the end. Used by every reference-insert path (role
 *  band click, role picker, asset picker, file upload) so chips end up
 *  inline in the same spot the user expected — at the `@` they typed, or
 *  at the end of the prompt for headless inserts. */
function appendOrReplaceMention(
  prev: string,
  kind: 'image' | 'video' | 'audio',
  id: string
): string {
  const marker = `{{ref:${kind}:${id}}}`;
  const atIdx = prev.lastIndexOf('@');
  if (atIdx !== -1 && !/\s/.test(prev.slice(atIdx + 1))) {
    return `${prev.slice(0, atIdx)}${marker} `;
  }
  if (prev.length === 0) return `${marker} `;
  return prev.endsWith(' ') ? `${prev}${marker} ` : `${prev} ${marker} `;
}

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
  /** Pre-registered Seedance asset id. Set when the entry came from a
   *  role whose moderation has cleared. Currently unused by the active
   *  video providers — kept on the type so the roles module stays
   *  forward-compatible if asset-based references return. */
  seedanceAssetId?: string;
  /** For video/audio reference uploads — duration in seconds. Tracked
   *  so we can enforce the 15s cumulative cap per media type. */
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

type PromptAssetTab = 'all' | 'roles' | 'image' | 'video';

function PromptAssetPreview({
  asset,
  mediaUrl,
  thumb,
}: {
  asset: Asset;
  mediaUrl: string;
  thumb: string;
}) {
  if (asset.type === 'video') {
    return (
      <video
        src={mediaUrl}
        poster={thumb !== mediaUrl ? thumb : undefined}
        className="size-full object-cover"
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          if (video.poster || !Number.isFinite(video.duration)) return;
          try {
            video.currentTime = Math.min(0.1, video.duration / 2);
          } catch {
            // Some remote video hosts reject seeking before enough data loads.
          }
        }}
      />
    );
  }

  return (
    <img
      src={thumb}
      alt=""
      className="size-full object-cover"
      loading="lazy"
      decoding="async"
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
    />
  );
}

function PromptAssetMentionPicker({
  open,
  tab,
  onTabChange,
  onAssetSelect,
  roles = [],
  onRoleSelect,
}: {
  open: boolean;
  tab: PromptAssetTab;
  onTabChange: (tab: PromptAssetTab) => void;
  onAssetSelect: (asset: Asset) => void;
  roles?: Role[];
  onRoleSelect?: (role: Role) => void;
}) {
  const assetQueryType: 'all' | AssetType =
    tab === 'image' || tab === 'video' ? tab : 'all';
  const { data, isLoading } = useAssets({
    type: assetQueryType,
    sort: 'latest',
    pageSize: 12,
    enabled: open && tab !== 'roles',
  });

  const assets = useMemo(
    () =>
      (data?.pages.flatMap((page) => page.assets) ?? [])
        .filter((asset) => asset.type === 'image' || asset.type === 'video')
        .slice(0, 12),
    [data]
  );
  const visibleRoles = useMemo(() => roles.slice(0, 12), [roles]);
  const showRoles = tab === 'all' || tab === 'roles';
  const showAssets = tab !== 'roles';
  const hasResults =
    (showRoles && visibleRoles.length > 0) || (showAssets && assets.length > 0);

  if (!open) return null;

  return (
    <div className="absolute right-0 bottom-full left-0 z-50 mb-3 overflow-hidden rounded-xl border border-white/15 bg-background/95 shadow-2xl backdrop-blur-2xl dark:bg-[#171717]/95">
      <div className="flex items-center justify-between gap-3 border-white/10 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <AtSign className="size-3.5" />
          <span>Insert asset</span>
        </div>
        <div className="flex rounded-md bg-foreground/[0.06] p-0.5">
          {[
            ['all', 'Recent'],
            ['roles', 'Roles'],
            ['image', 'Images'],
            ['video', 'Videos'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onTabChange(value as PromptAssetTab)}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                tab === value
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[260px] overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex h-28 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : hasResults ? (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {showRoles &&
              visibleRoles.map((role) => (
                <button
                  key={`role-${role.id}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onRoleSelect?.(role)}
                  className="group relative aspect-square overflow-hidden rounded-lg bg-foreground/[0.06] ring-1 ring-foreground/10 transition hover:ring-foreground/35"
                  aria-label={`Insert ${role.name} role`}
                >
                  <img
                    src={role.avatarUrl || role.imageUrl}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                  <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                    Role
                  </span>
                  <span className="absolute right-0 bottom-0 left-0 truncate bg-gradient-to-t from-black/75 to-transparent px-1.5 pt-5 pb-1 text-left text-[10px] text-white">
                    {role.name}
                  </span>
                </button>
              ))}
            {showAssets &&
              assets.map((asset) => {
                const mediaUrl = getAssetMediaUrl(asset);
                const thumb = getAssetThumbnailUrl(asset) ?? mediaUrl;
                if (!mediaUrl || !thumb) return null;

                return (
                  <button
                    key={asset.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onAssetSelect(asset)}
                    className="group relative aspect-square overflow-hidden rounded-lg bg-foreground/[0.06] ring-1 ring-foreground/10 transition hover:ring-foreground/35"
                    aria-label={`Insert ${asset.type} asset`}
                  >
                    <PromptAssetPreview
                      asset={asset}
                      mediaUrl={mediaUrl}
                      thumb={thumb}
                    />
                    <span className="absolute right-1 bottom-1 rounded bg-black/70 p-1 text-white">
                      {asset.type === 'video' ? (
                        <VideoIcon className="size-3" />
                      ) : (
                        <ImageIcon className="size-3" />
                      )}
                    </span>
                  </button>
                );
              })}
          </div>
        ) : (
          <div className="flex h-28 items-center justify-center text-muted-foreground text-sm">
            No assets yet
          </div>
        )}
      </div>
    </div>
  );
}

export default function OperationPanel({
  isGenerating,
  onRequireAuth,
  onGenerate,
}: OperationPanelProps) {
  const t = useTranslations('HomePage.videoHero');
  const { data: session } = authClient.useSession();
  const { data: planData } = useCurrentPlan(session?.user?.id);
  const isSubscribed = !!planData?.currentPlan && !planData.currentPlan.isFree;
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
  // Multimodal reference mode (Seedance 2.0 / 2.0 Fast / Wan 2.7)
  // accepts videos + audios alongside images. We bucket files by MIME
  // on upload; each bucket has its own upstream cap (3 / 3) + a
  // cumulative 15s / 500MB budget.
  const [referenceVideos, setReferenceVideos] = useState<UploadedImage[]>([]);
  const [referenceAudios, setReferenceAudios] = useState<UploadedImage[]>([]);
  const [imageInputImages, setImageInputImages] = useState<UploadedImage[]>([]);
  // Stubbed front-end slots for video Edit mode (no backend yet)
  const [editVideoStub, setEditVideoStub] = useState<UploadedImage[]>([]);
  const [editImageStub, setEditImageStub] = useState<UploadedImage[]>([]);

  const { uploadWithCaptcha, captchaDialog } = useCaptchaGatedUpload();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputTargetRef = useRef<UploadTarget>('first_frame');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [expanded, setExpanded] = useState(false);
  const [floating, setFloating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assetMentionOpen, setAssetMentionOpen] = useState(false);
  const [assetMentionTab, setAssetMentionTab] = useState<PromptAssetTab>('all');
  const [promptOverflow, setPromptOverflow] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const next = rect.bottom <= 0;
      setFloating(next);
      if (!next) setExpanded(false);
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
  const configGenerationType =
    mediaType === 'video' && videoSubMode === 'reference'
      ? 'REFERENCE_2_VIDEO'
      : mediaType === 'video' && videoSubMode === 'edit'
        ? 'VIDEO_EDIT'
        : undefined;
  const currentModelConfig = getVideoModelConfig(
    selectedModel,
    isImageInput,
    configGenerationType
  );

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
  const isGeminiOmni = selectedModel === 'gemini-omni';

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
    if (
      !supportedDurations.includes(duration) &&
      supportedDurations.length > 0
    ) {
      setDuration(supportedDurations[supportedDurations.length - 1]);
    }
  }, [supportedDurations, duration]);
  const [resolution, setResolution] = useState(supportedResolutions[0]);
  const [aspectRatio, setAspectRatio] = useState(
    supportedAspectRatios[0] || '16:9'
  );
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpg'>('png');
  const hasVideoInputForCredits =
    mediaType === 'video' &&
    ((videoSubMode === 'reference' && referenceVideos.length > 0) ||
      (videoSubMode === 'edit' && editVideoStub.length > 0));

  const creditsCost =
    mediaType === 'video'
      ? calculateVideoCredits(
          currentModelConfig?.id || '',
          duration,
          generateAudio && supportsAudio,
          resolution,
          hasVideoInputForCredits
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
      if (DEFAULT_VIDEO_MODEL === 'gemini-omni') setDuration(4);
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
      if (
        !options.find((o) => o.value === selectedModel) &&
        options.length > 0
      ) {
        setSelectedModel(options[0].value);
        if (options[0].value === 'gemini-omni') setDuration(4);
      }
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
      const config = getVideoModelConfig(
        modelId,
        isImageInput,
        configGenerationType
      );
      if (!config) return;
      const durations = config.supportedDurations || [8];
      if (modelId === 'gemini-omni' && durations.includes(4)) {
        setDuration(4);
      } else if (!durations.includes(duration)) {
        setDuration(durations[0]);
      }
      const resolutions = config.supportedResolutions || ['720p'];
      const locked = new Set(getLockedVideoResolutions(modelId, isSubscribed));
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
      configGenerationType,
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
      // Reference slot defers to the active model's declared cap
      // (Seedance 2.0 allows 9, veo3 R2V allows 3). Falls back to 5
      // for legacy models.
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
      // Multimodal reference upload rules:
      //
      // Seedance 2.0 / 2.0 Fast:
      // - Images: 1-9 refs; jpg/png/webp/bmp/tiff/gif/heic/heif; <30MB;
      //   300-6000px per side; aspect ratio 0.4-2.5.
      // - Videos: mp4/mov; max 3; each 2-15s and <50MB; total video
      //   duration <=15s; size/ratio/total-pixel checks live in
      //   validateSeedanceVideo.
      // - Audio: mp3/wav; max 3; each 2-15s and <15MB; total audio
      //   duration <=15s. Audio alone is not a valid reference.
      //
      // Wan 2.7:
      // - Optional first_frame is handled by the separate Frame slot
      //   (max 1 image).
      // - reference_image + reference_video: at least 1, combined <=5.
      //   reference_image supports jpg/png/webp/bmp, <20MB, 240-8000px,
      //   aspect ratio 1:8-8:1. reference_video supports mp4/mov,
      //   each 1-30s and <100MB, 240-4096px, aspect ratio 1:8-8:1.
      // - Voice is optional, tracked separately from the combined
      //   image/video cap. Product cap is 3 here for UI parity with
      //   Seedance, each 1-10s and <15MB. Voice alone is not valid.
      const MAX_BYTES = 30 * 1024 * 1024;
      const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
      const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
      const MIN_MEDIA_SECONDS = 2;
      const MAX_MEDIA_SECONDS = 15;
      const MAX_MEDIA_BYTES = 500 * 1024 * 1024;
      const REF_VIDEO_CAP = 3;
      const REF_AUDIO_CAP = 3;

      const showToast = (msg: string) =>
        toast(msg, {
          cancel: { label: t('validation.close'), onClick: () => {} },
          classNames: { title: 'flex-1 text-center' },
        });

      // Multimodal reference mode (Seedance 2.0 / 2.0 Fast / Wan 2.7)
      // accepts images + videos + audios in one shared upload button.
      // We bucket by MIME and enforce per-bucket count + cumulative
      // duration/size caps. For every other
      // (target, model) combo we fall back to the original single-bucket
      // flow.
      const isMultiBucket =
        target === 'reference' &&
        (selectedModel === 'seedance-2-0' ||
          selectedModel === 'seedance-2-0-fast' ||
          selectedModel === 'gemini-omni' ||
          selectedModel === 'wan2-7');
      const isGeminiReferenceUpload =
        isMultiBucket && selectedModel === 'gemini-omni';
      const isWanReferenceUpload = isMultiBucket && selectedModel === 'wan2-7';
      const isSeedanceReferenceUpload =
        isMultiBucket &&
        (selectedModel === 'seedance-2-0' ||
          selectedModel === 'seedance-2-0-fast');

      const allowVideoOnly = target === 'edit_video';
      const imageMimes =
        isWanReferenceUpload || isGeminiReferenceUpload
          ? ['image/jpeg', 'image/png', 'image/webp', 'image/bmp']
          : isSeedanceReferenceUpload
            ? [
                'image/jpeg',
                'image/png',
                'image/webp',
                'image/bmp',
                'image/tiff',
                'image/gif',
                'image/heic',
                'image/heif',
              ]
            : ['image/jpeg', 'image/png', 'image/webp'];
      // BytePlus Ark only accepts mp4 / mov containers and wav / mp3
      // audio. Anything else gets rejected upstream after we've already
      // uploaded it, so we gate at the picker.
      const videoMimes = ['video/mp4', 'video/quicktime'];
      const audioMimes = ['audio/mpeg', 'audio/mp3', 'audio/wav'];
      const allowedTypes = isMultiBucket
        ? isGeminiReferenceUpload
          ? [...imageMimes, ...videoMimes]
          : [...imageMimes, ...videoMimes, ...audioMimes]
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
        const imageMaxBytes =
          isWanReferenceUpload || isGeminiReferenceUpload
            ? 20 * 1024 * 1024
            : MAX_BYTES;
        const videoMaxBytes =
          isWanReferenceUpload || isGeminiReferenceUpload
            ? 100 * 1024 * 1024
            : MAX_VIDEO_BYTES;
        const minVideoSeconds =
          isWanReferenceUpload || isGeminiReferenceUpload
            ? 1
            : MIN_MEDIA_SECONDS;
        const maxVideoSeconds =
          isWanReferenceUpload || isGeminiReferenceUpload
            ? 30
            : MAX_MEDIA_SECONDS;
        const minAudioSeconds = isWanReferenceUpload ? 1 : MIN_MEDIA_SECONDS;
        const maxAudioSeconds = isWanReferenceUpload ? 10 : MAX_MEDIA_SECONDS;
        let wanReferenceSlotsLeft =
          5 - referenceImages.length - referenceVideos.length;
        let geminiReferenceQuota =
          7 - referenceImages.length - referenceVideos.length * 2;
        const refVideoCap = isGeminiReferenceUpload
          ? 1
          : isWanReferenceUpload
            ? 5
            : REF_VIDEO_CAP;
        let videoSlotsLeft = refVideoCap - referenceVideos.length;
        const refAudioCap = REF_AUDIO_CAP;
        let audioSlotsLeft = refAudioCap - referenceAudios.length;
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
            if (isGeminiReferenceUpload && geminiReferenceQuota < 1) {
              showToast(
                'Gemini Omni supports 7 reference units. Each image uses 1 and each video uses 2.'
              );
              continue;
            }
            if (isWanReferenceUpload && wanReferenceSlotsLeft <= 0) {
              showToast(
                'Wan 2.7 supports up to 5 reference images and videos combined.'
              );
              continue;
            }
            if (imageSlotsLeft <= 0) {
              showToast('Already at the image limit — extras ignored.');
              continue;
            }
            if (f.size > imageMaxBytes) {
              const mb = (f.size / (1024 * 1024)).toFixed(1);
              showToast(
                `${f.name} is ${mb} MB — image limit is ${
                  isWanReferenceUpload || isGeminiReferenceUpload ? 20 : 30
                } MB.`
              );
              continue;
            }
            if (!isGeminiReferenceUpload) {
              const check = isWanReferenceUpload
                ? await validateWanReferenceImage(f)
                : await validateSeedanceImage(f);
              if (!check.valid) {
                const msg =
                  check.reason === 'dimensions'
                    ? isWanReferenceUpload
                      ? `Image must be 240–8000 px on each side (${check.width}×${check.height}).`
                      : `Image must be 300–6000 px on each side (${check.width}×${check.height}).`
                    : check.reason === 'ratio'
                      ? isWanReferenceUpload
                        ? `Image aspect ratio must be between 1:8 and 8:1 (got ${
                            check.width && check.height
                              ? (check.width / check.height).toFixed(2)
                              : 'invalid'
                          }).`
                        : `Image aspect ratio must be between 0.4 and 2.5 (got ${
                            check.width && check.height
                              ? (check.width / check.height).toFixed(2)
                              : 'invalid'
                          }).`
                      : 'Could not decode image.';
                showToast(msg);
                continue;
              }
            }
            imageSlotsLeft--;
            if (isWanReferenceUpload) wanReferenceSlotsLeft--;
            if (isGeminiReferenceUpload) geminiReferenceQuota -= 1;
            accepted.push({ file: f, kind: 'image' });
          } else if (videoMimes.includes(f.type)) {
            if (isGeminiReferenceUpload && geminiReferenceQuota < 2) {
              showToast(
                'Gemini Omni supports 7 reference units. Each image uses 1 and each video uses 2.'
              );
              continue;
            }
            if (isWanReferenceUpload && wanReferenceSlotsLeft <= 0) {
              showToast(
                'Wan 2.7 supports up to 5 reference images and videos combined.'
              );
              continue;
            }
            if (videoSlotsLeft <= 0) {
              showToast(`Up to ${refVideoCap} videos — extras ignored.`);
              continue;
            }
            if (f.size > videoMaxBytes) {
              const mb = (f.size / (1024 * 1024)).toFixed(1);
              showToast(
                `${f.name} is ${mb} MB — video limit is ${
                  isWanReferenceUpload || isGeminiReferenceUpload ? 100 : 50
                } MB.`
              );
              continue;
            }
            let dur: number;
            try {
              dur = await readMediaDuration(f, 'video');
            } catch {
              showToast(`Could not read ${f.name} — try a different file.`);
              continue;
            }
            if (dur < minVideoSeconds) {
              showToast(
                `${f.name} is ${dur.toFixed(1)}s — videos must be at least ${minVideoSeconds}s.`
              );
              continue;
            }
            if (dur > maxVideoSeconds) {
              showToast(
                `${f.name} is ${dur.toFixed(1)}s — video limit is ${maxVideoSeconds}s.`
              );
              continue;
            }
            if (
              !isWanReferenceUpload &&
              !isGeminiReferenceUpload &&
              videoDurUsed + dur > MAX_MEDIA_SECONDS
            ) {
              showToast(
                `Video duration total would exceed ${MAX_MEDIA_SECONDS}s (current ${videoDurUsed.toFixed(1)}s + ${dur.toFixed(1)}s).`
              );
              continue;
            }
            if (videoSizeUsed + f.size > MAX_MEDIA_BYTES) {
              showToast('Total video size would exceed 500 MB.');
              continue;
            }
            if (!isGeminiReferenceUpload) {
              const vCheck = isWanReferenceUpload
                ? await validateWanReferenceVideo(f)
                : await validateSeedanceVideo(f);
              if (!vCheck.valid) {
                const msg =
                  vCheck.reason === 'dimensions'
                    ? isWanReferenceUpload
                      ? `Video must be 240–4096 px on each side (${vCheck.width}×${vCheck.height}).`
                      : `Video must be 300–6000 px on each side (${vCheck.width}×${vCheck.height}).`
                    : vCheck.reason === 'ratio'
                      ? isWanReferenceUpload
                        ? `Video aspect ratio must be between 1:8 and 8:1 (got ${
                            vCheck.width && vCheck.height
                              ? (vCheck.width / vCheck.height).toFixed(2)
                              : 'invalid'
                          }).`
                        : `Video aspect ratio must be between 0.4 and 2.5 (got ${
                            vCheck.width && vCheck.height
                              ? (vCheck.width / vCheck.height).toFixed(2)
                              : 'invalid'
                          }).`
                      : 'reason' in vCheck && vCheck.reason === 'total-pixels'
                        ? 'Video resolution out of range — try 480p / 720p / 1080p.'
                        : 'Could not decode video.';
                showToast(msg);
                continue;
              }
            }
            videoSlotsLeft--;
            if (isWanReferenceUpload) wanReferenceSlotsLeft--;
            if (isGeminiReferenceUpload) geminiReferenceQuota -= 2;
            videoDurUsed += dur;
            videoSizeUsed += f.size;
            accepted.push({ file: f, kind: 'video', durationSeconds: dur });
          } else if (audioMimes.includes(f.type)) {
            if (audioSlotsLeft <= 0) {
              showToast(`Up to ${refAudioCap} audios — extras ignored.`);
              continue;
            }
            if (f.size > MAX_AUDIO_BYTES) {
              const mb = (f.size / (1024 * 1024)).toFixed(1);
              showToast(`${f.name} is ${mb} MB — audio limit is 15 MB.`);
              continue;
            }
            let dur: number;
            try {
              dur = await readMediaDuration(f, 'audio');
            } catch {
              showToast(`Could not read ${f.name} — try a different file.`);
              continue;
            }
            if (dur < minAudioSeconds) {
              showToast(
                `${f.name} is ${dur.toFixed(1)}s — audios must be at least ${minAudioSeconds}s.`
              );
              continue;
            }
            if (dur > maxAudioSeconds) {
              showToast(
                `${f.name} is ${dur.toFixed(1)}s — audio limit is ${maxAudioSeconds}s.`
              );
              continue;
            }
            if (
              !isWanReferenceUpload &&
              audioDurUsed + dur > MAX_MEDIA_SECONDS
            ) {
              showToast(
                `Audio duration total would exceed ${MAX_MEDIA_SECONDS}s (current ${audioDurUsed.toFixed(1)}s + ${dur.toFixed(1)}s).`
              );
              continue;
            }
            if (audioSizeUsed + f.size > MAX_MEDIA_BYTES) {
              showToast('Total audio size would exceed 500 MB.');
              continue;
            }
            audioSlotsLeft--;
            audioDurUsed += dur;
            audioSizeUsed += f.size;
            accepted.push({ file: f, kind: 'audio', durationSeconds: dur });
          } else {
            showToast(
              `Unsupported file: ${f.type || 'unknown'}. Use image, mp4/mov, or mp3/wav.`
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
          // Append a chip marker for the freshly uploaded reference. Uses
          // the shared helper so the marker lands at the user's typed `@`
          // if one is present, or at the end otherwise.
          const refKind = a.kind;
          const refId = entry.id;
          setPrompt((prev) => appendOrReplaceMention(prev, refKind, refId));
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
        validFiles.push(f);
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

  // Multimodal reference mode tracks images / videos / audios in
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
  const handleSelectRole = useCallback(
    (role: Role) => {
      setVideoSubMode('reference');
      const max = currentModelConfig?.imageCapabilities?.maxImages ?? 5;
      // Pre-flight against the closure's referenceImages snapshot.
      // Adding `referenceImages` to the deps keeps this snapshot fresh
      // between human-speed clicks. The setState updater still re-checks
      // atomically in case two clicks land in the same React batch.
      if (referenceImages.length >= max) return;
      if (referenceImages.some((r) => r.roleId === role.id)) return;

      const entryId = crypto.randomUUID();
      setReferenceImages((prev) => {
        if (prev.length >= max) return prev;
        if (prev.some((r) => r.roleId === role.id)) return prev;
        const entry: UploadedImage = {
          id: entryId,
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
      // Always append the marker via a functional setPrompt update so
      // back-to-back clicks compose correctly. Earlier this branch was
      // gated on a side-effect bool set inside the setReferenceImages
      // updater — that updater only runs eagerly when the fiber has no
      // pending lanes, so the gate silently dropped the second click's
      // marker on rapid clicks. If the rare race rejects the reference
      // entirely (same role clicked twice in one batch), the marker
      // becomes an orphan that renderInto + the backend serializer both
      // strip silently, so the visible + submitted prompt stay correct.
      setPrompt((prev) => appendOrReplaceMention(prev, 'image', entryId));
      setAssetMentionOpen(false);
    },
    [currentModelConfig, referenceImages]
  );

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
      const editReferenceImages = isGeminiOmni ? [] : editImageStub;
      const allEditMedia = [...editVideoStub, ...editReferenceImages];
      if (allEditMedia.some((m) => m.uploading)) {
        validationToast(t('validation.uploading'));
        return;
      }
      const refUrls = editReferenceImages
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
      referenceVideos.length === 0
    ) {
      validationToast(
        selectedModel === 'wan2-7'
          ? 'Add at least 1 reference image or video.'
          : t('validation.referenceRequired')
      );
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
      for (const img of firstFrameImages) {
        if (img.r2Url) {
          urls.push(img.r2Url);
          roles.push('first_frame');
        }
      }
      const hasLast = supportsLastFrame && lastFrameImages.length > 0;
      if (hasLast) {
        for (const img of lastFrameImages) {
          if (img.r2Url) {
            urls.push(img.r2Url);
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
      for (const img of referenceImages) {
        if (img.r2Url) {
          urls.push(img.r2Url);
          roles.push('reference_image');
        }
      }
      // Optional first-frame "Frame" slot. Suppressed for BytePlus
      // Seedance 2.0 series since they disallow mixing first_frame with
      // reference_image in the same request.
      const allowFirstFrameInReference =
        selectedModel !== 'seedance-2-0' &&
        selectedModel !== 'seedance-2-0-fast';
      if (allowFirstFrameInReference) {
        for (const img of firstFrameImages) {
          if (img.r2Url) {
            urls.push(img.r2Url);
            roles.push('first_frame');
          }
        }
      }
      image_urls = urls.length > 0 ? urls : undefined;
      image_roles = roles.length > 0 ? roles : undefined;
      generationType = 'REFERENCE_2_VIDEO';

      // Multimodal reference: video + audio passed as separate
      // top-level arrays; providers that don't support them ignore.
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

    // In reference mode the prompt contains `{{ref:kind:id}}` markers
    // that came from inline chips. The upstream API can't read those,
    // so we expand them to plain `Image 1` / `Video 2` / `Audio 3` based
    // on each marker's position in its respective array. Other modes
    // never contain markers — the serializer is a no-op for them.
    const finalPrompt =
      videoSubMode === 'reference'
        ? serializePromptForBackend(
            prompt,
            referenceImages,
            referenceVideos,
            referenceAudios
          )
        : prompt.trim();

    onGenerate({
      mediaType: 'video',
      model: selectedModel,
      prompt: finalPrompt,
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

  const removeTrailingAt = useCallback((value: string) => {
    const atIndex = value.lastIndexOf('@');
    if (atIndex === -1) return value;

    const suffix = value.slice(atIndex + 1);
    if (/\s/.test(suffix)) return value;

    return `${value.slice(0, atIndex)}${value.slice(atIndex + 1)}`;
  }, []);

  const assetMentionEnabled =
    mediaType === 'video' && videoSubMode === 'reference';

  useEffect(() => {
    if (!assetMentionEnabled) {
      setAssetMentionOpen(false);
    }
  }, [assetMentionEnabled]);

  const measurePromptOverflow = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setPromptOverflow(false);
      return;
    }

    setPromptOverflow(textarea.scrollHeight > textarea.clientHeight + 1);
  }, []);

  useEffect(() => {
    measurePromptOverflow();
  }, [measurePromptOverflow, prompt, expanded, floating]);

  const handlePromptChange = useCallback(
    (value: string) => {
      setPrompt(value);
      requestAnimationFrame(measurePromptOverflow);

      if (!assetMentionEnabled) {
        setAssetMentionOpen(false);
        return;
      }

      const atIndex = value.lastIndexOf('@');
      const suffix = atIndex === -1 ? '' : value.slice(atIndex + 1);
      setAssetMentionOpen(atIndex !== -1 && !/\s/.test(suffix));
    },
    [assetMentionEnabled, measurePromptOverflow]
  );

  const handleClearPrompt = useCallback(() => {
    setPrompt('');
    setAssetMentionOpen(false);
    requestAnimationFrame(measurePromptOverflow);
  }, [measurePromptOverflow]);

  const pushAssetToTarget = useCallback(
    (assetUrl: string, target: UploadTarget, kind?: UploadedImage['kind']) => {
      const setter = setterFor(target);
      setter((prev) => {
        if (prev.length >= maxFor(target)) return prev;
        const next: UploadedImage = {
          id: crypto.randomUUID(),
          file: null as unknown as File,
          previewUrl: assetUrl,
          r2Url: assetUrl,
          uploading: false,
          kind,
        };
        return [...prev, next];
      });
    },
    [currentModelConfig, maxImageInputs]
  );

  const handleAssetMentionSelect = useCallback(
    (asset: Asset) => {
      const mediaUrl = getAssetMediaUrl(asset);
      if (!mediaUrl) return;

      const insertRefIntoPrompt = (
        kind: 'image' | 'video' | 'audio',
        id: string
      ) => {
        setPrompt((prev) => appendOrReplaceMention(prev, kind, id));
      };

      if (asset.type === 'image') {
        // Reference mode: route through the chip-marker path so the
        // selection lands inline at the user's `@`, replacing the typed
        // mention literal and adding the asset to referenceImages.
        if (mediaType === 'video' && videoSubMode === 'reference') {
          const refId = crypto.randomUUID();
          setReferenceImages((prev) => {
            const max = currentModelConfig?.imageCapabilities?.maxImages ?? 5;
            if (prev.length >= max) return prev;
            return [
              ...prev,
              {
                id: refId,
                file: null as unknown as File,
                previewUrl: mediaUrl,
                r2Url: mediaUrl,
                uploading: false,
                kind: 'image',
              },
            ];
          });
          insertRefIntoPrompt('image', refId);
        } else if (mediaType === 'image') {
          pushAssetToTarget(mediaUrl, 'image_input', 'image');
          setPrompt(removeTrailingAt(prompt));
        } else if (videoSubMode === 'edit') {
          pushAssetToTarget(mediaUrl, 'edit_image', 'image');
          setPrompt(removeTrailingAt(prompt));
        } else if (firstFrameImages.length === 0) {
          pushAssetToTarget(mediaUrl, 'first_frame', 'image');
          setPrompt(removeTrailingAt(prompt));
        } else if (supportsLastFrame && lastFrameImages.length === 0) {
          pushAssetToTarget(mediaUrl, 'last_frame', 'image');
          setPrompt(removeTrailingAt(prompt));
        } else {
          setVideoSubMode('reference');
          const refId = crypto.randomUUID();
          setReferenceImages((prev) => {
            const max = currentModelConfig?.imageCapabilities?.maxImages ?? 5;
            if (prev.length >= max) return prev;
            return [
              ...prev,
              {
                id: refId,
                file: null as unknown as File,
                previewUrl: mediaUrl,
                r2Url: mediaUrl,
                uploading: false,
                kind: 'image',
              },
            ];
          });
          insertRefIntoPrompt('image', refId);
        }
      } else {
        if (mediaType === 'video' && videoSubMode === 'edit') {
          pushAssetToTarget(mediaUrl, 'edit_video', 'video');
          setPrompt(removeTrailingAt(prompt));
        } else if (mediaType === 'video') {
          setVideoSubMode('reference');
          const refId = crypto.randomUUID();
          setReferenceVideos((prev) => {
            if (prev.length >= 3) return prev;
            return [
              ...prev,
              {
                id: refId,
                file: null as unknown as File,
                previewUrl: mediaUrl,
                r2Url: mediaUrl,
                uploading: false,
                kind: 'video',
              },
            ];
          });
          insertRefIntoPrompt('video', refId);
        } else {
          const label = asset.title || asset.prompt || 'video asset';
          setPrompt(
            `${removeTrailingAt(prompt).trimEnd()} @${label.slice(0, 48)} ${mediaUrl}`.trimStart()
          );
        }
      }

      setAssetMentionOpen(false);
    },
    [
      currentModelConfig,
      firstFrameImages.length,
      lastFrameImages.length,
      mediaType,
      prompt,
      pushAssetToTarget,
      removeTrailingAt,
      supportsLastFrame,
      videoSubMode,
    ]
  );

  const handleRoleMentionSelect = useCallback(
    (role: Role) => {
      // handleSelectRole already does the smart `@xxx` → chip replacement
      // via appendOrReplaceMention, so we don't need a separate strip.
      handleSelectRole(role);
      setAssetMentionOpen(false);
    },
    [handleSelectRole]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (assetMentionOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setAssetMentionOpen(false);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        return;
      }
    }

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
      referenceVideos.length > 0 ||
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
    opts: { hideCount?: boolean; variant?: 'pill' | 'reference' } = {}
  ) => {
    const count = images.length;
    const max = maxFor(target);
    const isReferenceVariant = opts.variant === 'reference';
    return (
      <button
        type="button"
        onClick={() => triggerUpload(target)}
        aria-label={label}
        disabled={count >= max}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground/80 transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          isReferenceVariant
            ? 'h-9 rounded-lg border border-dashed border-foreground/20 bg-foreground/[0.04] px-3 hover:border-foreground/35 hover:bg-foreground/[0.07]'
            : 'h-8 rounded-full border border-foreground/10 bg-foreground/[0.06] px-3.5 hover:bg-foreground/[0.1]'
        )}
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
        selectedModel === 'seedance-2-0' ||
        selectedModel === 'seedance-2-0-fast' ||
        selectedModel === 'gemini-omni' ||
        selectedModel === 'wan2-7';
      const isSeedanceRef =
        selectedModel === 'seedance-2-0' ||
        selectedModel === 'seedance-2-0-fast';
      const isWanRef = selectedModel === 'wan2-7';
      const isGeminiRef = selectedModel === 'gemini-omni';
      const imgCap = currentModelConfig?.imageCapabilities?.maxImages ?? 5;
      const referenceMediaCount =
        referenceImages.length + referenceVideos.length;
      const geminiReferenceUnits =
        referenceImages.length + referenceVideos.length * 2;
      const multiBucketAllFull = isGeminiRef
        ? geminiReferenceUnits >= 7
        : isWanRef
          ? referenceMediaCount >= 5 && referenceAudios.length >= 3
          : referenceImages.length >= imgCap &&
            referenceVideos.length >= 3 &&
            referenceAudios.length >= 3;
      const referenceLabel =
        isWanRef || isGeminiRef
          ? 'Add'
          : isSeedanceRef
            ? 'Add'
            : refCount === 0
              ? 'Reference'
              : 'Add';
      const referenceCount = isGeminiRef
        ? `Images ${referenceImages.length}/7 · Videos ${referenceVideos.length}/1`
        : isWanRef
          ? `Image/Video ${referenceMediaCount}/5${referenceMediaCount === 0 ? ' required' : ''} · Voice ${referenceAudios.length}/3`
          : isSeedanceRef
            ? `Images ${referenceImages.length}/${imgCap} · Videos ${referenceVideos.length}/3 · Audio ${referenceAudios.length}/3`
            : refCount > 0
              ? String(refCount)
              : null;
      return (
        <div className="flex items-center gap-2">
          {isMultiBucketRef ? (
            <button
              type="button"
              onClick={() => triggerUpload('reference')}
              aria-label="Reference"
              disabled={multiBucketAllFull}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-foreground/20 bg-foreground/[0.04] px-3 text-xs font-medium text-foreground/80 transition-colors hover:border-foreground/35 hover:bg-foreground/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="size-3.5" />
              <span>{referenceLabel}</span>
              {referenceCount && (
                <span className="ml-0.5 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] tabular-nums">
                  {referenceCount}
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
          {!isSeedanceRef &&
            !isGeminiRef &&
            renderUploadPill(firstFrameImages, 'first_frame', 'Frame', {
              variant: 'reference',
            })}
        </div>
      );
    }
    if (videoSubMode === 'edit') {
      const imgLabel = editImageStub.length === 0 ? 'Image' : 'Add';
      return (
        <div className="flex items-center gap-2">
          {renderUploadPill(editVideoStub, 'edit_video', 'Video')}
          {!isGeminiOmni && (
            <>
              <span aria-hidden className="h-6 w-px bg-foreground/15" />
              {renderUploadPill(editImageStub, 'edit_image', imgLabel)}
            </>
          )}
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
          <span
            aria-hidden
            className="hidden text-muted-foreground/50 sm:inline"
          >
            |
          </span>
          <span className="hidden min-w-[4ch] text-center tabular-nums sm:inline-block">
            {aspectRatio}
          </span>
          {mediaType === 'video' && (
            <>
              <span
                aria-hidden
                className="hidden text-muted-foreground/50 sm:inline"
              >
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
    <div className="group/pill relative isolate flex w-full cursor-text items-center gap-3 rounded-full border border-white/40 bg-background/75 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-1px_0_rgba(0,0,0,0.05)] backdrop-blur-3xl backdrop-saturate-200 transition-colors hover:border-white/55 dark:border-white/15 dark:bg-background/60 dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.2)] dark:hover:border-white/25">
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={promptPlaceholder}
        className="absolute inset-0 z-0 rounded-full cursor-text"
      />
      <BorderGlow radius="rounded-full" />
      <span
        aria-hidden
        className="pointer-events-none relative z-10 flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06] text-muted-foreground dark:bg-white/[0.06]"
      >
        <ImagePlus className="size-4" />
      </span>
      <span className="pointer-events-none relative z-10 min-w-0 flex-1 truncate text-sm text-muted-foreground">
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
        className="relative z-10 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.08] px-3 text-xs font-medium text-foreground/90 transition-colors hover:bg-foreground/[0.12] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
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

  // ── Expanded panel (matches simplified Wan layout) ────────────────────
  const expandedPanel = (
    <div className="relative flex flex-col gap-2">
      {mediaType === 'video' && (
        <div className="relative z-0">
          <RoleBand
            roles={allRoles}
            selectedRoleIds={selectedRoleIds}
            onSelectRole={handleSelectRole}
            onAddRole={handleAddRole}
            upload={uploadWithCaptcha}
          />
        </div>
      )}
      <div className="relative z-20 isolate flex gap-2.5 rounded-2xl border border-white/40 bg-background/75 p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_0_rgba(0,0,0,0.06)] backdrop-blur-3xl backdrop-saturate-200 dark:border-white/15 dark:bg-background/60 dark:shadow-[0_20px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.25)]">
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
              {floating && expanded && (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  aria-label="Close"
                  className="ml-0.5 inline-flex size-6 items-center justify-center rounded-full border border-foreground/10 bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/[0.1] hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Prompt area — in reference mode the chips render *inline* inside
           * the editor, so we suppress the chip-row entirely and swap the
           * textarea for the contenteditable ReferencePromptEditor. */}
          <div className="flex flex-col gap-1.5">
            {videoSubMode === 'edit' &&
              (editVideoStub.length > 0 ||
                (!isGeminiOmni && editImageStub.length > 0)) && (
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
                  {!isGeminiOmni &&
                    editImageStub.map((img, idx) => (
                      <RoleChip
                        key={img.id}
                        name={`Image ${idx + 1}`}
                        avatarUrl={img.previewUrl}
                        onRemove={() => removeImage(img.id, 'edit_image')}
                      />
                    ))}
                </div>
              )}

            {videoSubMode === 'reference' ? (
              <div className="relative">
                <PromptAssetMentionPicker
                  open={assetMentionEnabled && assetMentionOpen}
                  tab={assetMentionTab}
                  onTabChange={setAssetMentionTab}
                  onAssetSelect={handleAssetMentionSelect}
                  roles={allRoles}
                  onRoleSelect={handleRoleMentionSelect}
                />
                <ReferencePromptEditor
                  value={prompt}
                  onChange={setPrompt}
                  placeholder={promptPlaceholder}
                  onEnter={handleGenerate}
                  images={referenceImages.map((i) => ({
                    id: i.id,
                    thumbUrl: i.roleAvatarUrl || i.previewUrl,
                    label: i.roleName,
                  }))}
                  videos={referenceVideos.map((v) => ({ id: v.id }))}
                  audios={referenceAudios.map((a) => ({ id: a.id }))}
                  onRefRemove={(kind, id) => {
                    if (kind === 'image') removeImage(id, 'reference');
                    else removeReferenceMedia(id, kind);
                  }}
                  mentionOpen={assetMentionEnabled && assetMentionOpen}
                  onMentionChange={(open) => setAssetMentionOpen(open)}
                  onCloseMention={() => setAssetMentionOpen(false)}
                />
              </div>
            ) : (
              <div className="relative">
                <PromptAssetMentionPicker
                  open={assetMentionEnabled && assetMentionOpen}
                  tab={assetMentionTab}
                  onTabChange={setAssetMentionTab}
                  onAssetSelect={handleAssetMentionSelect}
                  roles={allRoles}
                  onRoleSelect={handleRoleMentionSelect}
                />
                <Textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => handlePromptChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={promptPlaceholder}
                  maxLength={4000}
                  className="min-h-[44px] max-h-60 overflow-y-auto resize-none border-none bg-transparent p-0 text-sm leading-snug shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
                />
              </div>
            )}
          </div>

          {/* Bottom row: upload slots | Generate */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {renderUploadSlots()}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {promptOverflow && prompt.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearPrompt}
                  className="inline-flex h-8 items-center rounded-full border border-foreground/10 bg-foreground/[0.06] px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.1] hover:text-foreground"
                >
                  Clear all
                </button>
              )}
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
          videoSubMode === 'reference' &&
          (selectedModel === 'seedance-2-0' ||
            selectedModel === 'seedance-2-0-fast')
            ? 'image/jpeg,image/png,image/webp,image/bmp,image/tiff,image/gif,image/heic,image/heif,.heic,.heif,.tif,.tiff,video/mp4,video/quicktime,audio/mpeg,audio/mp3,audio/wav'
            : videoSubMode === 'reference' && selectedModel === 'gemini-omni'
              ? 'image/jpeg,image/png,image/webp,image/bmp,video/mp4,video/quicktime'
              : videoSubMode === 'reference' && selectedModel === 'wan2-7'
                ? 'image/jpeg,image/png,image/webp,image/bmp,video/mp4,video/quicktime,audio/mpeg,audio/mp3,audio/wav'
                : 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime'
        }
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFileUpload(e.target.files);
          e.target.value = '';
        }}
      />

      <div ref={slotRef} className="mx-auto w-full max-w-[900px]">
        {expandedPanel}
      </div>

      {floating && (
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
