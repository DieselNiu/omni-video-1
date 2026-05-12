'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useImageGenerationStore } from '@/stores/image-generation-store';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ActiveGeneration } from './active-generation';
import { DEMO_MEDIA } from './data/demo-media';
import { EmptyState } from './empty-state';
import { MasonryGallery } from './masonry-gallery';

interface ImageGalleryProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onRegenerate?: () => void;
  onCancel?: () => void;
  onAddToPrompt?: (imageUrl: string) => void;
  onTryWithWan26?: () => void;
}

export function ImageGallery({
  activeTab: controlledActiveTab,
  onTabChange,
  onRegenerate,
  onCancel,
  onAddToPrompt,
  onTryWithWan26,
}: ImageGalleryProps) {
  const t = useTranslations('AIWorkspace');
  const [internalActiveTab, setInternalActiveTab] = useState('explore');
  const { status } = useImageGenerationStore();

  // Use controlled or internal state
  const activeTab = controlledActiveTab ?? internalActiveTab;

  const handleTabChange = (tab: string) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalActiveTab(tab);
    }
  };

  // Sync internal state with controlled state
  useEffect(() => {
    if (controlledActiveTab !== undefined) {
      setInternalActiveTab(controlledActiveTab);
    }
  }, [controlledActiveTab]);

  // Check if there's an active generation (not idle)
  const hasActiveGeneration = status !== 'idle';
  const exploreItems = DEMO_MEDIA;

  return (
    <div className="p-4 md:p-6">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="explore" className="px-4">
            {t('explore')}
          </TabsTrigger>
          <TabsTrigger value="my-creations" className="px-4">
            {t('myCreations')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="explore" className="mt-4">
          <MasonryGallery items={exploreItems} />
        </TabsContent>

        <TabsContent value="my-creations" className="mt-4">
          {/* Show active generation at the top if exists */}
          {hasActiveGeneration && (
            <ActiveGeneration
              onRegenerate={onRegenerate}
              onCancel={onCancel}
              onAddToPrompt={onAddToPrompt}
              onTryWithWan26={onTryWithWan26}
            />
          )}

          {/* Show empty state only if no active generation */}
          {!hasActiveGeneration && <EmptyState />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Re-export components for flexible usage
export { MasonryGallery } from './masonry-gallery';
export { GalleryItem } from './gallery-item';
export { VideoModal } from './video-modal';
export { EmptyState } from './empty-state';
export { ActiveGeneration } from './active-generation';

// Re-export types
export type { MediaItem, VideoModalProps, GalleryItemProps } from './types';
