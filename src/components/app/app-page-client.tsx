'use client';

import { NsfwUpgradeDialog } from '@/components/pricing/nsfw-upgrade-dialog';
import { usePendingGeneration } from '@/hooks/use-pending-generation';
import { useTaskInit } from '@/hooks/use-task-init';
import { cn } from '@/lib/utils';
import { useAppPageStore } from '@/stores/app-page-store';
import { ChevronLeft, ChevronRight, HistoryIcon, PlusIcon } from 'lucide-react';
import { useEffect } from 'react';
import { AppFloatingBar } from './app-floating-bar';
import { OperationPanel } from './operation-panel';
import { ResultFeed } from './result-feed';

interface AppPageClientProps {
  target: 'image' | 'video';
  taskId?: string;
}

export function AppPageClient({ target, taskId }: AppPageClientProps) {
  const {
    panelExpanded,
    togglePanel,
    setPanelExpanded,
    setPanelMode,
    mobileTab,
    setMobileTab,
    moderationDialog,
    setModerationDialog,
  } = useAppPageStore();

  // Initialize task from URL taskId (fetch status, start polling if needed)
  useTaskInit(taskId);

  // Auto-submit pending generation (redirected from /image or /video page).
  // Moderation errors (submit-time AND poll-time) write to `moderationDialog`
  // in the store; we subscribe to it directly above to render the dialog.
  usePendingGeneration();

  // Open the operation panel when the user navigates here directly (e.g.
  // from the sidebar) instead of being redirected by a Generate click on
  // a marketing page. The redirect path stages a `pendingGeneration` in
  // the store before navigating, so we use its presence as the signal:
  // - no pendingGeneration → fresh navigation, open the panel
  // - has pendingGeneration → mid-submit redirect, leave panel state alone
  //   (the floating bar is the primary surface for that flow).
  // Read pendingGeneration via getState so this effect doesn't re-fire when
  // it gets cleared by usePendingGeneration.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional one-shot on mount + target change
  useEffect(() => {
    const hasPending = useAppPageStore.getState().pendingGeneration !== null;
    if (!hasPending) {
      setPanelExpanded(true);
    }
  }, [target]);

  // Sync target from URL to store
  useEffect(() => {
    if (target === 'image') {
      setPanelMode('txt2img');
    } else {
      setPanelMode('txt2vid');
    }
  }, [target, setPanelMode]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Mobile tabs - visible only on small screens */}
      <div className="flex md:hidden border-b">
        <button
          type="button"
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors',
            mobileTab === 'create'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground'
          )}
          onClick={() => setMobileTab('create')}
        >
          <PlusIcon className="size-4" />
          Create
        </button>
        <button
          type="button"
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors',
            mobileTab === 'history'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground'
          )}
          onClick={() => setMobileTab('history')}
        >
          <HistoryIcon className="size-4" />
          History
        </button>
      </div>

      {/* Mobile layout */}
      <div className="flex flex-1 overflow-hidden md:hidden">
        {mobileTab === 'create' ? (
          <div className="flex-1 overflow-y-auto">
            <OperationPanel target={target} />
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <ResultFeed taskId={taskId} />
          </div>
        )}
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex flex-1 overflow-hidden bg-background pr-3 py-3">
        {/* Operation Panel + Toggle button group */}
        <div className="flex-shrink-0 flex items-stretch">
          {/* Operation Panel - collapsible with smooth transition */}
          <div
            className={cn(
              'overflow-hidden transition-[width] duration-300 ease-in-out',
              panelExpanded ? 'w-[420px] pl-3' : 'w-0'
            )}
          >
            <div className="w-[408px] h-full max-h-full flex flex-col overflow-hidden rounded-xl border bg-sidebar shadow-sm">
              {/* Panel header */}
              <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-sidebar rounded-t-xl">
                <span className="text-sm font-semibold">
                  {target === 'image' ? 'Text to Image' : 'Text to Video'}
                </span>
              </div>
              {/* Panel content */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <OperationPanel target={target} />
              </div>
            </div>
          </div>

          {/* Toggle button - hugs left nav when collapsed, right of panel when expanded */}
          <div
            className={cn(
              'flex items-center z-10',
              panelExpanded ? '-ml-px' : 'ml-0.5'
            )}
          >
            <button
              type="button"
              className={cn(
                'flex items-center justify-center w-5 h-24 rounded-lg',
                'bg-foreground/[0.08] hover:bg-foreground/[0.15] border border-foreground/[0.06]',
                'text-foreground/30 hover:text-foreground/50',
                'transition-all duration-200 cursor-pointer'
              )}
              onClick={togglePanel}
              aria-label={panelExpanded ? 'Collapse panel' : 'Expand panel'}
            >
              {panelExpanded ? (
                <ChevronLeft className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
            </button>
          </div>
        </div>

        {/* Main content area - Feed + Floating Bar */}
        <div
          className={cn(
            'relative flex flex-1 flex-col overflow-hidden transition-colors duration-300 ml-2',
            panelExpanded
              ? 'rounded-xl border shadow-sm bg-sidebar'
              : 'bg-background'
          )}
          data-panel={panelExpanded ? 'expanded' : 'collapsed'}
        >
          <ResultFeed taskId={taskId} />
          <AppFloatingBar target={target} />
        </div>
      </div>

      {/* Moderation upgrade dialog — shown when EITHER the submit API
       * returns NSFW_BLOCKED, OR the polling phase later detects a content
       * moderation rejection from the upstream provider. The state is shared
       * via the store so both code paths route through the same dialog. */}
      <NsfwUpgradeDialog
        open={moderationDialog !== null}
        onOpenChange={(open) => !open && setModerationDialog(null)}
        variant={moderationDialog ?? 'blocked'}
      />
    </div>
  );
}
