import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const CONTENT_TYPE_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
};

function sanitizeFilename(filename: string | null): string {
  if (!filename) return 'download';

  const sanitized = filename
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return sanitized || 'download';
}

function withContentTypeExtension(
  filename: string,
  contentType: string
): string {
  const extension =
    CONTENT_TYPE_EXTENSION_MAP[contentType.split(';')[0]?.trim()];
  if (!extension) return filename;

  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex <= 0) {
    return `${filename}.${extension}`;
  }

  return `${filename.slice(0, lastDotIndex)}.${extension}`;
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');
  const filename = sanitizeFilename(searchParams.get('filename'));

  if (!url) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 }
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json(
      { error: 'Invalid url parameter' },
      { status: 400 }
    );
  }

  if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
    return NextResponse.json(
      { error: 'Unsupported url protocol' },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(parsedUrl.toString(), {
      headers: {
        Accept: '*/*',
      },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream responded with ${upstream.status}` },
        { status: upstream.status }
      );
    }

    const contentType =
      upstream.headers.get('content-type') || 'application/octet-stream';
    const downloadFilename = withContentTypeExtension(filename, contentType);
    const arrayBuffer = await upstream.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${downloadFilename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Download proxy failed:', error);
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 502 }
    );
  }
}
