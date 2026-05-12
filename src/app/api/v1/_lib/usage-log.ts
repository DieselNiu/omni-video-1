import { randomUUID } from 'crypto';
import { getDb } from '@/db';
import { apiUsageLog } from '@/db/schema';

export type ApiUsageStatus =
  | 'success'
  | 'insufficient_credits'
  | 'provider_error'
  | 'unauthorized'
  | 'not_found'
  | 'invalid_input'
  | 'failed';

export interface LogApiUsageParams {
  userId: string | null;
  apiKeyId: string | null;
  endpoint: 'submit' | 'query';
  taskId?: string | null;
  status: ApiUsageStatus;
  creditsDelta?: number;
  errorMessage?: string | null;
}

/**
 * Fire-and-forget logging of every /api/v1 call. Failures are swallowed so
 * logging never breaks the request path. For unauthorized requests where we
 * have no userId, the row is simply skipped (userId is NOT NULL in schema).
 */
export async function logApiUsage(params: LogApiUsageParams): Promise<void> {
  if (!params.userId) return;
  try {
    const db = await getDb();
    await db.insert(apiUsageLog).values({
      id: randomUUID(),
      userId: params.userId,
      apiKeyId: params.apiKeyId,
      endpoint: params.endpoint,
      taskId: params.taskId ?? null,
      status: params.status,
      creditsDelta: params.creditsDelta ?? 0,
      errorMessage: params.errorMessage ?? null,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('[api/v1] failed to write usage log:', error);
  }
}
