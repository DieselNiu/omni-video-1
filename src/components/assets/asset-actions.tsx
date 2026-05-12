'use client';

import { getAssetMediaUrl } from '@/assets/business/asset-mapper';
import type { Asset } from '@/assets/types';
import { Button } from '@/components/ui/button';
import { useVideoDownloadGuard } from '@/components/watermark-overlay';
import { downloadImage, generateDownloadFilename } from '@/lib/utils';
import {
  DownloadIcon,
  Loader2Icon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface AssetActionsProps {
  asset: Asset;
  onDelete: () => Promise<void>;
  onRegenerate: () => void;
  onClose?: () => void;
}

export function AssetActions({
  asset,
  onDelete,
  onRegenerate,
  onClose,
}: AssetActionsProps) {
  const t = useTranslations('Dashboard.assets.actions');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { guardDownload } = useVideoDownloadGuard();

  const mediaUrl = getAssetMediaUrl(asset);

  const handleDownload = async () => {
    if (!mediaUrl) return;

    const doDownload = async () => {
      setIsDownloading(true);
      try {
        const type = asset.type === 'video' ? 'video' : 'image';
        const filename = generateDownloadFilename(type, asset.prompt);
        await downloadImage(mediaUrl, filename);
      } catch (error) {
        console.error('Download failed:', error);
      } finally {
        setIsDownloading(false);
      }
    };

    if (asset.type === 'video') {
      guardDownload(doDownload);
    } else {
      await doDownload();
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
      onClose?.();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRegenerate = () => {
    onRegenerate();
    onClose?.();
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={handleDownload}
        disabled={!mediaUrl || isDownloading}
      >
        {isDownloading ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <DownloadIcon />
        )}
        {t('download')}
      </Button>

      <Button variant="outline" onClick={handleRegenerate}>
        <RefreshCwIcon />
        {t('regenerate')}
      </Button>

      <Button
        variant="destructive"
        onClick={handleDelete}
        disabled={isDeleting}
      >
        {isDeleting ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
        {t('delete')}
      </Button>
    </div>
  );
}
