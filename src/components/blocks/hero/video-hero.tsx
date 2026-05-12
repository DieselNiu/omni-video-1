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
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useCallback, useRef, useState } from 'react';
import OperationPanel from './operation-panel';
import PreviewPanel, { type PreviewState } from './preview-panel';

const LoginModal = dynamic(
  () => import('@/components/auth/login-modal').then((m) => m.LoginModal),
  { ssr: false }
);

export default function VideoHeroSection() {
  const t = useTranslations('HomePage.videoHero');
  const { data: session } = authClient.useSession();
  const { generate } = useVideoGeneration();

  const [previewState, setPreviewState] = useState<PreviewState>('idle');
  const [progress, setProgress] = useState(0);
  const [resultVideoUrl, setResultVideoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

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

            {/* operation box */}
            <div className="mt-6 sm:mt-8">
              <div className="rounded-2xl bg-card border p-4 sm:p-6 shadow-lg">
                <div className="flex flex-col lg:flex-row gap-6">
                  <OperationPanel
                    isGenerating={previewState === 'generating'}
                    onGenerate={handleGenerate}
                  />

                  {/* divider */}
                  <div className="hidden lg:block w-px bg-border -my-6" />

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
    </main>
  );
}
