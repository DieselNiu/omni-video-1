import { resolveImageGenerationStatus } from '@/image/core/resolve-status';
import { getImageGenerationById } from '@/image/data/image-generation';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const record = await getImageGenerationById(id);

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    if (record.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const resolved = await resolveImageGenerationStatus(
      {
        id: record.id,
        userId: record.userId,
        modelId: record.modelId,
        prompt: record.prompt,
        status: record.status,
        providerRequestId: record.providerRequestId,
        outputImageUrls: record.outputImageUrls,
        outputImageUrlsR2: record.outputImageUrlsR2,
        errorMessage: record.errorMessage,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      { urlPolicy: 'r2-or-fallback' }
    );

    return NextResponse.json(resolved);
  } catch (error) {
    console.error('Image generation status error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
