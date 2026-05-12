export type AspectRatioType =
  | '1:1'
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:2'
  | '3:4'
  | '2:3'
  | '4:5';

export interface MediaItem {
  id: string;
  src: string;
  type: 'image' | 'video';
  prompt: string;
  thumbnail?: string;
  resolution?: string;
  aspectRatio: AspectRatioType;
  isImage?: boolean;
  model: string;
}

export interface VideoModalProps {
  item: MediaItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface GalleryItemProps {
  item: MediaItem;
  activeVideoId: string | null;
  onVideoHover: (videoId: string | null) => void;
  onItemClick: (item: MediaItem) => void;
}
