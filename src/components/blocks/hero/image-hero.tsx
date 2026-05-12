'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useHomeGeneration } from '@/hooks/use-home-generation';
import { useHomeImageStore } from '@/stores/home-image-store';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { HomeCountdownDialog } from './home-generation-dialogs';
import ImageOperationPanel from './image-operation-panel';
import ImagePreviewPanel from './image-preview-panel';

const LoginModal = dynamic(
  () => import('@/components/auth/login-modal').then((m) => m.LoginModal),
  { ssr: false }
);
const UpgradeDialog = dynamic(
  () =>
    import('@/components/pricing/upgrade-dialog').then((m) => m.UpgradeDialog),
  { ssr: false }
);
const HomeRecentGenerations = dynamic(
  () =>
    import('./home-recent-generations').then((m) => m.HomeRecentGenerations),
  { ssr: false }
);

export default function ImageHeroSection() {
  const t = useTranslations('HomePage.imageHero');
  const {
    quota,
    previewState,
    progress,
    resultImageUrl,
    errorMessage,
    recentGenerations,
    selectedRecentId,
    isGenerating,
    isQuotaLoading,
    isRecentLoading,
    loginModalState,
    isCountdownOpen,
    countdownSeconds,
    handleGenerate,
    handleCancelGeneration,
    handleRetry,
    handleLoginSuccess,
    handleLoginModalOpenChange,
    handleCountdownModalOpenChange,
    isUpgradeDialogOpen,
    upgradeDialogTrigger,
    handleUpgradeDialogOpenChange,
    openUpgradeDialogPreservingPending,
    selectRecentGeneration,
    captchaDialog,
  } = useHomeGeneration();
  const openLoginModal = useHomeImageStore((s) => s.openLoginModal);
  const isQuotaLoginDialog = loginModalState.reason === 'anon_exhausted';

  return (
    <main id="hero" className="overflow-hidden">
      {captchaDialog}
      <section>
        <div className="relative pt-2 sm:pt-3 lg:pt-4">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center space-y-2 sm:space-y-3">
              <h1 className="text-balance text-3xl font-bold font-bricolage-grotesque leading-tight sm:text-4xl md:text-5xl">
                {t('title')}
              </h1>

              <p className="mx-auto max-w-5xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                {t('description')}
              </p>
            </div>

            <div className="mt-6 sm:mt-8">
              <div className="rounded-2xl bg-card border p-4 sm:p-6 shadow-lg">
                <div className="flex flex-col lg:flex-row gap-6">
                  <ImageOperationPanel
                    isGenerating={isGenerating}
                    quota={quota}
                    isQuotaLoading={isQuotaLoading}
                    onCooldownClick={() => handleCountdownModalOpenChange(true)}
                    onGenerate={handleGenerate}
                  />

                  <div className="hidden lg:block w-px bg-border -my-6" />

                  <div className="flex-1 space-y-4">
                    <ImagePreviewPanel
                      previewState={previewState}
                      progress={progress}
                      resultImageUrl={resultImageUrl}
                      errorMessage={errorMessage}
                      onCancel={handleCancelGeneration}
                      onRetry={handleRetry}
                      onUpgradeClick={() =>
                        handleUpgradeDialogOpenChange(
                          true,
                          'preview_remove_watermark'
                        )
                      }
                    />

                    <HomeRecentGenerations
                      items={recentGenerations}
                      loading={isRecentLoading}
                      selectedId={selectedRecentId}
                      onSelect={selectRecentGeneration}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Dialog
        open={loginModalState.open}
        onOpenChange={handleLoginModalOpenChange}
      >
        <DialogContent
          className={
            isQuotaLoginDialog
              ? 'overflow-hidden rounded-2xl p-0 sm:max-w-[440px]'
              : 'border-0 bg-transparent p-0 shadow-none sm:max-w-md'
          }
        >
          <DialogHeader className="hidden">
            <DialogTitle>Login</DialogTitle>
          </DialogHeader>
          <LoginModal
            reason={loginModalState.reason}
            onSuccess={handleLoginSuccess}
            onCancel={() => handleLoginModalOpenChange(false)}
            onUpgrade={() => {
              openUpgradeDialogPreservingPending('login_modal_upgrade');
            }}
            onRequestLogin={() => openLoginModal('default')}
          />
        </DialogContent>
      </Dialog>

      <HomeCountdownDialog
        open={isCountdownOpen}
        onOpenChange={handleCountdownModalOpenChange}
        countdownSeconds={countdownSeconds}
        onUpgrade={() => {
          handleCountdownModalOpenChange(false);
          handleUpgradeDialogOpenChange(true, 'cooldown_hit');
        }}
      />

      <UpgradeDialog
        open={isUpgradeDialogOpen}
        onOpenChange={handleUpgradeDialogOpenChange}
        trigger={upgradeDialogTrigger}
      />
    </main>
  );
}
