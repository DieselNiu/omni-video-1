'use client';

import { useState } from 'react';
import Masonry from 'react-masonry-css';
import { GalleryItem } from './gallery-item';
import type { MediaItem } from './types';
import { VideoModal } from './video-modal';

interface MasonryGalleryProps {
  items: MediaItem[];
}

export function MasonryGallery({ items }: MasonryGalleryProps) {
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const breakpointColumns = {
    default: 4, // Desktop: 4 columns
    1280: 4, // Large desktop: 4 columns
    768: 3, // Tablet: 3 columns
    480: 2, // Mobile: 2 columns
    0: 1, // Small mobile: 1 column
  };

  // Group items by column (fixed column filling)
  const ITEMS_PER_COLUMN = 5;
  const columns: MediaItem[][] = [[], [], [], []]; // 4 columns

  items.forEach((item, index) => {
    const columnIndex = Math.floor(index / ITEMS_PER_COLUMN);
    if (columns[columnIndex]) {
      columns[columnIndex].push(item);
    }
  });

  const handleItemClick = (item: MediaItem) => {
    setSelectedItem(item);
    setModalOpen(true);
  };

  return (
    <>
      <Masonry
        breakpointCols={breakpointColumns}
        className="flex w-auto -ml-4"
        columnClassName="pl-4 bg-clip-padding"
      >
        {columns.map((columnItems, columnIndex) => (
          <div key={columnIndex}>
            {columnItems.map((item) => (
              <GalleryItem
                key={item.id}
                item={item}
                activeVideoId={activeVideoId}
                onVideoHover={setActiveVideoId}
                onItemClick={handleItemClick}
              />
            ))}
          </div>
        ))}
      </Masonry>

      <VideoModal
        item={selectedItem}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  );
}
