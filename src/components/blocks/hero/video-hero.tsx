'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useImageGeneration } from '@/hooks/use-image-generation';
import {
  type VideoStatusResponse,
  useVideoGeneration,
} from '@/hooks/use-video-generation';
import { authClient } from '@/lib/auth-client';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useCallback, useRef, useState } from 'react';
import OperationPanel from './operation-panel';
import PreviewPanel, { type PreviewState } from './preview-panel';

const LoginModal = dynamic(
  () => import('@/components/auth/login-modal').then((m) => m.LoginModal),
  { ssr: false }
);
const NsfwUpgradeDialog = dynamic(
  () =>
    import('@/components/pricing/nsfw-upgrade-dialog').then(
      (m) => m.NsfwUpgradeDialog
    ),
  { ssr: false }
);

export default function VideoHeroSection() {
  const t = useTranslations('HomePage.videoHero');
  const { data: session } = authClient.useSession();
  const { generate } = useVideoGeneration();
  const { generate: generateImage } = useImageGeneration();

  const [previewState, setPreviewState] = useState<PreviewState>('idle');
  const [progress, setProgress] = useState(0);
  const [resultVideoUrl, setResultVideoUrl] = useState<string | null>(null);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [nsfwDialogVariant, setNsfwDialogVariant] = useState<
    'blocked' | 'moderation' | null
  >(null);

  // Simulated progress timer ref
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  // Simulate progress (0→90%) while waiting for real result
  const startSimulatedProgress = useCallback(() => {
    clearProgressTimer();
    setProgress(0);
    let current = 0;
    progressTimerRef.current = setInterval(() => {
      const remaining = 90 - current;
      const increment = Math.max(0.3, remaining * 0.02);
      current = Math.min(90, current + increment);
      setProgress(Math.round(current));
    }, 500);
  }, [clearProgressTimer]);

  const handleGenerate = useCallback(
    async (params: {
      mediaType: 'video' | 'image';
      model: string;
      prompt: string;
      image_urls?: string[];
      image_roles?: ('first_frame' | 'last_frame' | 'reference_image')[];
      video_url?: string;
      aspect_ratio: string;
      duration: number;
      resolution: string;
      generationType: string;
      generate_audio?: boolean;
      output_format?: 'png' | 'jpg';
      referenceVideos?: string[];
      referenceAudios?: string[];
      inputVideoDurationSeconds?: number;
    }) => {
      // Check login
      if (!session?.user) {
        setShowLoginModal(true);
        return;
      }

      if (previewState === 'generating') return;

      // Reset state
      setPreviewState('generating');
      setResultVideoUrl(null);
      setResultImageUrl(null);
      setErrorMessage(null);
      startSimulatedProgress();

      if (params.mediaType === 'image') {
        try {
          await generateImage(
            {
              modelId: params.model,
              prompt: params.prompt,
              mode:
                params.image_urls && params.image_urls.length > 0
                  ? 'image-to-image'
                  : 'text-to-image',
              imageUrls: params.image_urls,
              aspectRatio: params.aspect_ratio,
              resolution: params.resolution,
              outputFormat: params.output_format,
            },
            {
              onComplete: (status) => {
                clearProgressTimer();
                setProgress(100);
                const url =
                  status.imageUrlsR2?.[0] || status.imageUrls?.[0] || null;
                setResultImageUrl(url);
                setPreviewState('done');
              },
              onError: (error: Error) => {
                clearProgressTimer();
                setProgress(0);
                const code = (error as Error & { code?: string }).code;
                if (code === 'NSFW_BLOCKED') {
                  setNsfwDialogVariant('blocked');
                  setPreviewState('idle');
                  return;
                }
                if (code === 'CONTENT_MODERATION') {
                  setNsfwDialogVariant('moderation');
                  setPreviewState('idle');
                  return;
                }
                if (code === 'SUBSCRIPTION_REQUIRED') {
                  // Upgrade dialog already opened by the image hook; quietly
                  // reset the preview without surfacing a failure state.
                  setPreviewState('idle');
                  return;
                }
                setErrorMessage(error.message || 'Image generation failed');
                setPreviewState('failed');
              },
            }
          );
        } catch {
          // already handled via onError
        }
        return;
      }

      try {
        await generate(
          {
            model: params.model,
            prompt: params.prompt,
            image_urls: params.image_urls,
            image_roles: params.image_roles,
            video_url: params.video_url,
            aspect_ratio: params.aspect_ratio,
            duration: params.duration,
            resolution: params.resolution,
            generationType: params.generationType,
            generate_audio: params.generate_audio,
            referenceVideos: params.referenceVideos,
            referenceAudios: params.referenceAudios,
            inputVideoDurationSeconds: params.inputVideoDurationSeconds,
          },
          {
            onUpdate: (status: VideoStatusResponse) => {
              if (status.progress > 0) {
                setProgress(Math.min(95, status.progress));
              }
            },
            onComplete: (status: VideoStatusResponse) => {
              clearProgressTimer();
              setProgress(100);
              setResultVideoUrl(status.videoUrl || null);
              setPreviewState('done');
            },
            onError: (error: Error) => {
              clearProgressTimer();
              setProgress(0);
              const code = (error as Error & { code?: string }).code;
              if (code === 'NSFW_BLOCKED') {
                setNsfwDialogVariant('blocked');
                setPreviewState('idle');
                return;
              }
              if (code === 'CONTENT_MODERATION') {
                setNsfwDialogVariant('moderation');
                setPreviewState('idle');
                return;
              }
              setErrorMessage(error.message || 'Video generation failed');
              setPreviewState('failed');
            },
          }
        );
      } catch {
        // Error already handled via onError callback
      }
    },
    [
      session,
      previewState,
      generate,
      generateImage,
      startSimulatedProgress,
      clearProgressTimer,
    ]
  );

  const handleRetry = useCallback(() => {
    setPreviewState('idle');
    setErrorMessage(null);
    setProgress(0);
    setResultImageUrl(null);
  }, []);

  return (
    <main id="hero" className="overflow-hidden">
      <section>
        <div className="relative pt-2 sm:pt-3 lg:pt-4">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {/* title & subtitle */}
            <div className="text-center space-y-2 sm:space-y-3">
              <h1 className="text-balance text-3xl font-bold font-bricolage-grotesque leading-tight sm:text-4xl md:text-5xl">
                {t('title')}
              </h1>

              <p className="mx-auto max-w-4xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base">
                {t('description')}
              </p>
            </div>

            {/* preview area — centered, sits above the operation bar */}
            <div className="mt-6 sm:mt-8">
              <div className="mx-auto w-full max-w-3xl">
                <PreviewPanel
                  previewState={previewState}
                  progress={progress}
                  resultVideoUrl={resultVideoUrl}
                  resultImageUrl={resultImageUrl}
                  errorMessage={errorMessage}
                  onRetry={handleRetry}
                />
              </div>
            </div>

            {/* operation bar — pinned to the bottom of the hero */}
            <div className="mt-4 sm:mt-6">
              <OperationPanel
                isGenerating={previewState === 'generating'}
                onRequireAuth={() => setShowLoginModal(true)}
                onGenerate={handleGenerate}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Login Modal */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
          <DialogHeader className="hidden">
            <DialogTitle>Login</DialogTitle>
          </DialogHeader>
          <LoginModal />
        </DialogContent>
      </Dialog>

      {/* NSFW upgrade dialog — fires when the API returns NSFW_BLOCKED
       * (submit-time) or CONTENT_MODERATION (provider-rejected mid-poll). */}
      <NsfwUpgradeDialog
        open={nsfwDialogVariant !== null}
        onOpenChange={(open) => !open && setNsfwDialogVariant(null)}
        variant={nsfwDialogVariant ?? 'blocked'}
      />
    </main>
  );
}
