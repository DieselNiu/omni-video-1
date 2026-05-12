/**
 * Gallery Types
 * Type definitions for the image/video gallery components
 */

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
  src: string; // For videos: video URL, For images: image URL
  type: 'image' | 'video';
  prompt: string;
  thumbnail?: string; // Video thumbnail image
  resolution?: string; // Video/Image resolution (e.g., '1080p', '4K')
  aspectRatio: AspectRatioType;
  isImage?: boolean; // Mark as image explicitly
  model: string; // Which AI model generated this content
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
