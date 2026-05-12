'use server';

import { getDb } from '@/db';
import { apiKey, apiUsageLog } from '@/db/schema';
import type { User } from '@/lib/auth-types';
import { userActionClient } from '@/lib/safe-action';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

const schema = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

/**
 * Paginated API usage log for the current user. Joined against `api_key` so
 * the UI can show which key (by prefix) each call used — `keyPrefix` is null
 * when the referenced key was deleted.
 */
export const getApiUsageAction = userActionClient
  .schema(schema)
  .action(async ({ parsedInput, ctx }) => {
    const user = (ctx as { user: User }).user;
    const page = parsedInput.page ?? 1;
    const pageSize = parsedInput.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    try {
      const db = await getDb();

      const [rows, totalRow] = await Promise.all([
        db
          .select({
            id: apiUsageLog.id,
            apiKeyId: apiUsageLog.apiKeyId,
            endpoint: apiUsageLog.endpoint,
            taskId: apiUsageLog.taskId,
            status: apiUsageLog.status,
            creditsDelta: apiUsageLog.creditsDelta,
            errorMessage: apiUsageLog.errorMessage,
            createdAt: apiUsageLog.createdAt,
            keyPrefix: apiKey.keyPrefix,
          })
          .from(apiUsageLog)
          .leftJoin(apiKey, eq(apiUsageLog.apiKeyId, apiKey.id))
          .where(eq(apiUsageLog.userId, user.id))
          .orderBy(desc(apiUsageLog.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(apiUsageLog)
          .where(eq(apiUsageLog.userId, user.id)),
      ]);

      const total = totalRow[0]?.count ?? 0;

      return {
        success: true as const,
        data: {
          items: rows,
          total,
          page,
          pageSize,
        },
      };
    } catch (error) {
      console.error('get api usage error:', error);
      return {
        success: false as const,
        error:
          error instanceof Error ? error.message : 'Failed to fetch API usage',
      };
    }
  });
