'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useHomeGeneration } from '@/hooks/use-home-generation';
import { useHomeImageStore } from '@/stores/home-image-store';
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
const NsfwUpgradeDialog = dynamic(
  () =>
    import('@/components/pricing/nsfw-upgrade-dialog').then(
      (m) => m.NsfwUpgradeDialog
    ),
  { ssr: false }
);

export default function ImageHeroSection() {
  const {
    quota,
    previewState,
    progress,
    resultImageUrl,
    errorMessage,
    recentGenerations,
    selectedRecentId,
    isGenerating,
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
          <div className="mx-auto max-w-screen-2xl px-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:gap-6">
              <div className="order-2 w-full min-w-0 shrink-0 rounded-xl border bg-card p-3 shadow-lg sm:rounded-2xl sm:p-5 lg:order-1 lg:w-[40%]">
                <ImageOperationPanel
                  isGenerating={isGenerating}
                  quota={quota}
                  onGenerate={handleGenerate}
                />
              </div>

              <div className="order-1 flex min-w-0 flex-1 lg:order-2">
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
                  recentGenerations={recentGenerations}
                  isRecentLoading={isRecentLoading}
                  selectedRecentId={selectedRecentId}
                  onSelectRecent={selectRecentGeneration}
                />
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

      {upgradeDialogTrigger === 'nsfw_block' ? (
        <NsfwUpgradeDialog
          open={isUpgradeDialogOpen}
          onOpenChange={handleUpgradeDialogOpenChange}
          variant="blocked"
        />
      ) : (
        <UpgradeDialog
          open={isUpgradeDialogOpen}
          onOpenChange={handleUpgradeDialogOpenChange}
          trigger={upgradeDialogTrigger}
        />
      )}
    </main>
  );
}
