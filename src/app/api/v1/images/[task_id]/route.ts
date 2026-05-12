import { resolveImageGenerationStatus } from '@/image/core/resolve-status';
import { getImageGenerationById } from '@/image/data/image-generation';
import {
  markApiKeyUsed,
  parseBearerToken,
  validateApiKey,
} from '@/lib/api-keys';
import { NextResponse } from 'next/server';
import { logApiUsage } from '../../_lib/usage-log';

type ApiStatus = 'pending' | 'processing' | 'completed' | 'failed';

function mapStatus(dbStatus: string, hasR2Urls: boolean): ApiStatus {
  switch (dbStatus) {
    case 'PENDING':
    case 'IN_QUEUE':
    case 'IN_PROGRESS':
    case 'PROCESSING':
      return 'processing';
    case 'SAVED_TO_R2':
      return hasR2Urls ? 'completed' : 'processing';
    case 'COMPLETED':
      return hasR2Urls ? 'completed' : 'processing';
    case 'FAILED':
      return 'failed';
    default:
      return 'processing';
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ task_id: string }> }
) {
  const token = parseBearerToken(request.headers.get('authorization'));
  if (!token) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Missing Bearer token' },
      { status: 401 }
    );
  }

  const validated = await validateApiKey(token);
  if (!validated) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Invalid or revoked API key' },
      { status: 401 }
    );
  }

  void markApiKeyUsed(validated.id).catch((err) =>
    console.error('[api/v1/query] markApiKeyUsed failed:', err)
  );

  const userId = validated.userId;
  const apiKeyId = validated.id;

  const { task_id: taskId } = await context.params;

  const record = await getImageGenerationById(taskId);
  if (!record || record.userId !== userId) {
    await logApiUsage({
      userId,
      apiKeyId,
      endpoint: 'query',
      taskId,
      status: 'not_found',
      creditsDelta: 0,
    });
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'Task not found' },
      { status: 404 }
    );
  }

  const resolved = await resolveImageGenerationStatus(record, {
    urlPolicy: 'r2-only',
  });

  const r2Urls = resolved.imageUrlsR2 ?? [];
  const status = mapStatus(resolved.status, r2Urls.length > 0);

  await logApiUsage({
    userId,
    apiKeyId,
    endpoint: 'query',
    taskId: record.id,
    status: 'success',
    creditsDelta: 0,
  });

  return NextResponse.json(
    {
      task_id: record.id,
      status,
      images: r2Urls,
      error_message: resolved.errorMessage,
      created_at: resolved.createdAt ? resolved.createdAt.toISOString() : null,
      updated_at: resolved.updatedAt ? resolved.updatedAt.toISOString() : null,
    },
    { status: 200 }
  );
}
