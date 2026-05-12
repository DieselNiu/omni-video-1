'use client';

import { cn } from '@/lib/utils';
import { DownloadIcon, HeartIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

interface MediaContextMenuProps {
  children: React.ReactNode;
  onDownload?: () => void;
  onFavorite?: () => void;
  isFavorited?: boolean;
  className?: string;
}

interface MenuPosition {
  x: number;
  y: number;
}

export function MediaContextMenu({
  children,
  onDownload,
  onFavorite,
  isFavorited = false,
  className,
}: MediaContextMenuProps) {
  const t = useTranslations('Common.contextMenu');
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Adjust position to keep menu within viewport
      const x = Math.min(e.clientX, window.innerWidth - 180);
      const y = Math.min(e.clientY, window.innerHeight - 100);

      setPosition({ x, y });
      setOpen(true);
    },
    []
  );

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  // Close on click outside or Escape
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    // Use setTimeout to avoid the click that opens the menu from immediately closing it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, handleClose]);

  return (
    <div onContextMenu={handleContextMenu} className={className}>
      {children}

      {open && (
        <div
          ref={menuRef}
          className="fixed z-[100] min-w-[160px] rounded-lg border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
          style={{ left: position.x, top: position.y }}
        >
          {onDownload && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
                handleClose();
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-popover-foreground transition-colors hover:bg-accent"
            >
              <DownloadIcon className="size-4" />
              {t('download')}
            </button>
          )}
          {onFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFavorite();
                handleClose();
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-popover-foreground transition-colors hover:bg-accent"
            >
              <HeartIcon
                className={cn(
                  'size-4',
                  isFavorited && 'fill-current text-red-500'
                )}
              />
              {isFavorited ? t('unfavorite') : t('favorite')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
