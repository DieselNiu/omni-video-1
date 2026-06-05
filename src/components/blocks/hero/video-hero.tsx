'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  type VideoStatusResponse,
  useVideoGeneration,
} from '@/hooks/use-video-generation';
import { authClient } from '@/lib/auth-client';
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
  const { data: session } = authClient.useSession();
  const { generate } = useVideoGeneration();

  const [previewState, setPreviewState] = useState<PreviewState>('idle');
  const [progress, setProgress] = useState(0);
  const [resultVideoUrl, setResultVideoUrl] = useState<string | null>(null);
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
      model: string;
      prompt: string;
      image_urls?: string[];
      image_roles?: ('first_frame' | 'last_frame' | 'reference_image')[];
      video_urls?: string[];
      audio_urls?: string[];
      return_last_frame?: boolean;
      inputVideoDurationSeconds?: number;
      aspect_ratio: string;
      duration: number;
      resolution: string;
      generationType: string;
      generate_audio?: boolean;
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
      setErrorMessage(null);
      startSimulatedProgress();

      try {
        await generate(
          {
            model: params.model,
            prompt: params.prompt,
            image_urls: params.image_urls,
            image_roles: params.image_roles,
            video_urls: params.video_urls,
            audio_urls: params.audio_urls,
            return_last_frame: params.return_last_frame,
            inputVideoDurationSeconds: params.inputVideoDurationSeconds,
            aspect_ratio: params.aspect_ratio,
            duration: params.duration,
            resolution: params.resolution,
            generationType: params.generationType,
            generate_audio: params.generate_audio,
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
      startSimulatedProgress,
      clearProgressTimer,
    ]
  );

  const handleRetry = useCallback(() => {
    setPreviewState('idle');
    setErrorMessage(null);
    setProgress(0);
  }, []);

  return (
    <main id="hero" className="overflow-hidden">
      <section>
        <div className="relative pt-2 sm:pt-3 lg:pt-4">
          <div className="mx-auto max-w-screen-2xl px-3 sm:px-6 lg:px-8">
            {/* operation box — two separate cards */}
            <div className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:gap-6">
              <div className="order-2 w-full min-w-0 shrink-0 rounded-xl border bg-card p-3 shadow-lg sm:rounded-2xl sm:p-5 lg:order-1 lg:w-[40%]">
                <OperationPanel
                  isGenerating={previewState === 'generating'}
                  onGenerate={handleGenerate}
                />
              </div>

              <div className="order-1 flex min-w-0 flex-1 lg:order-2">
                <PreviewPanel
                  previewState={previewState}
                  progress={progress}
                  resultVideoUrl={resultVideoUrl}
                  errorMessage={errorMessage}
                  onRetry={handleRetry}
                />
              </div>
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
