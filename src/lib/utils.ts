import { getBrandSlug } from '@/lib/brand';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a branded download filename.
 * Format: {brand}-{type}-{sanitized-prompt}-{YYYYMMDD}-{rand}.{ext}
 * Example: chatgpt-image-2-image-a-cute-dog-running-20260209-x3f7.png
 */
export function generateDownloadFilename(
  type: 'image' | 'video',
  prompt: string | undefined | null,
  extension?: string
): string {
  const brand = getBrandSlug();
  const ext = extension || (type === 'video' ? 'mp4' : 'png');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6);

  if (!prompt || !prompt.trim()) {
    return `${brand}-${type}-${date}-${rand}.${ext}`;
  }

  // Take first ~8 words, lowercase, keep only ASCII alphanumeric + hyphens
  const sanitized = prompt
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 8)
    .join('-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  return `${brand}-${type}-${sanitized ? `${sanitized}-` : ''}${date}-${rand}.${ext}`;
}

/**
 * Download an image from URL using server-side proxy to bypass CORS
 */
export async function downloadImage(
  url: string,
  filename: string
): Promise<void> {
  try {
    // Use the download proxy endpoint to bypass CORS restrictions
    const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
    const response = await fetch(proxyUrl);

    if (!response.ok) {
      throw new Error(
        `Download failed: ${response.status} ${response.statusText}`
      );
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (err) {
    console.error('Download failed:', err);
    throw err;
  }
}
