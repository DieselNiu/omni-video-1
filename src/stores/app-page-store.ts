import { create } from 'zustand';

export type PanelMode = 'txt2img' | 'img2img' | 'txt2vid' | 'img2vid';
export type FeedFilter = 'all' | 'image' | 'video';
export type MobileTab = 'create' | 'history';

/** Params stored when redirecting from /image or /video to /app for immediate submission */
export interface PendingImageGeneration {
  type: 'image';
  /** Optimistic placeholder id added to activeGenerations before navigation;
   * usePendingGeneration swaps it for the real id once the submit API responds. */
  tempId: string;
  modelId: string;
  prompt: string;
  mode: 'text-to-image' | 'image-to-image';
  imageUrls?: string[];
  aspectRatio?: string;
  resolution?: string;
}

export interface PendingVideoGeneration {
  type: 'video';
  /** See PendingImageGeneration.tempId */
  tempId: string;
  model: string;
  prompt: string;
  generationType: string;
  imageUrls?: string[];
  imageRoles?: ('first_frame' | 'last_frame' | 'reference_image')[];
  aspectRatio?: string;
  duration?: number;
  resolution?: string;
  generateAudio?: boolean;
}

export type PendingGeneration = PendingImageGeneration | PendingVideoGeneration;

export type ModerationDialogVariant = 'blocked' | 'moderation';

export interface ActiveGeneration {
  id: string;
  taskId: string;
  status: string;
  progress?: number;
  mediaType: 'image' | 'video';
  startTime: number;
  prompt?: string;
  modelId?: string;
  // Populated as soon as the poll detects completion, so the loading card
  // can render the final media immediately without waiting for the feed
  // refetch. Prevents a visual flash of the previous generation's image.
  outputImageUrl?: string;
  outputVideoUrl?: string;
  // Set when polling reports FAILED, so the card can render an error state
  // (instead of the loading animation) during the grace window before removal.
  errorMessage?: string;
}

interface AppPageState {
  // Panel state
  panelExpanded: boolean;
  panelMode: PanelMode;

  // Feed state
  feedFilter: FeedFilter;

  // Active generations (polling tasks)
  activeGenerations: Map<string, ActiveGeneration>;

  // Reprompt state
  repromptText: string | null;

  // Pending generation (redirect-then-submit from /image or /video)
  pendingGeneration: PendingGeneration | null;

  // Moderation upgrade dialog (shown on /app when submit OR polling detects
  // an NSFW / content moderation failure for a generation that originated
  // from a redirect — keeps the dialog state in one place so both submit-time
  // and poll-time error paths can trigger it).
  moderationDialog: ModerationDialogVariant | null;

  // Mobile tab state
  mobileTab: MobileTab;

  // Actions
  togglePanel: () => void;
  setPanelExpanded: (expanded: boolean) => void;
  setPanelMode: (mode: PanelMode) => void;
  setFeedFilter: (filter: FeedFilter) => void;
  setMobileTab: (tab: MobileTab) => void;
  addActiveGeneration: (generation: ActiveGeneration) => void;
  updateActiveGeneration: (
    id: string,
    update: Partial<ActiveGeneration>
  ) => void;
  removeActiveGeneration: (id: string) => void;
  replaceActiveGeneration: (
    oldId: string,
    generation: ActiveGeneration
  ) => void;
  setRepromptText: (text: string | null) => void;
  setPendingGeneration: (pending: PendingGeneration | null) => void;
  consumePendingGeneration: () => PendingGeneration | null;
  setModerationDialog: (variant: ModerationDialogVariant | null) => void;
}

export const useAppPageStore = create<AppPageState>((set) => ({
  panelExpanded: false,
  panelMode: 'txt2img',
  feedFilter: 'all',
  activeGenerations: new Map(),
  repromptText: null,
  pendingGeneration: null,
  moderationDialog: null,
  mobileTab: 'create',

  togglePanel: () => set((state) => ({ panelExpanded: !state.panelExpanded })),

  setPanelExpanded: (expanded) => set({ panelExpanded: expanded }),

  setPanelMode: (mode) => set({ panelMode: mode }),

  setFeedFilter: (filter) => set({ feedFilter: filter }),

  addActiveGeneration: (generation) =>
    set((state) => {
      const next = new Map(state.activeGenerations);
      next.set(generation.id, generation);
      return { activeGenerations: next };
    }),

  updateActiveGeneration: (id, update) =>
    set((state) => {
      const current = state.activeGenerations.get(id);
      if (!current) return state;
      const next = new Map(state.activeGenerations);
      next.set(id, { ...current, ...update });
      return { activeGenerations: next };
    }),

  removeActiveGeneration: (id) =>
    set((state) => {
      const next = new Map(state.activeGenerations);
      next.delete(id);
      return { activeGenerations: next };
    }),

  replaceActiveGeneration: (oldId, generation) =>
    set((state) => {
      const next = new Map(state.activeGenerations);
      next.delete(oldId);
      next.set(generation.id, generation);
      return { activeGenerations: next };
    }),

  setMobileTab: (tab) => set({ mobileTab: tab }),

  setRepromptText: (text) => set({ repromptText: text }),

  setPendingGeneration: (pending) => set({ pendingGeneration: pending }),

  consumePendingGeneration: (): PendingGeneration | null => {
    const state = useAppPageStore.getState();
    const current = state.pendingGeneration;
    if (current) {
      set({ pendingGeneration: null });
    }
    return current;
  },

  setModerationDialog: (variant) => set({ moderationDialog: variant }),
}));
