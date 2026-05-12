'use server';

import { getDb } from '@/db';
import { asset, user } from '@/db/schema';
import { isDemoWebsite } from '@/lib/demo';
import { adminActionClient } from '@/lib/safe-action';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';

// Status grouping constants
const SUCCEEDED_STATUSES = ['COMPLETED', 'SAVED_TO_R2'];
const FAILED_STATUSES = ['FAILED'];
const IN_PROGRESS_STATUSES = ['PENDING', 'IN_QUEUE', 'IN_PROGRESS'];

// --------------------------------------------------------------------------
// 1. getGenerationsAction - paginated list with filters
// --------------------------------------------------------------------------

const getGenerationsSchema = z.object({
  dateStart: z.string(),
  dateEnd: z.string(),
  modelId: z.string().optional().default(''),
  status: z.string().optional().default(''),
  type: z.string().optional().default(''),
  userId: z.string().optional().default(''),
  channel: z.string().optional().default(''),
  search: z.string().optional().default(''),
  pageIndex: z.number().min(0).default(0),
  pageSize: z.number().min(1).max(100).default(10),
  sorting: z
    .array(
      z.object({
        id: z.string(),
        desc: z.boolean(),
      })
    )
    .optional()
    .default([]),
});

const sortFieldMap = {
  createdAt: asset.createdAt,
  creditsUsed: asset.creditsUsed,
} as const;

export const getGenerationsAction = adminActionClient
  .schema(getGenerationsSchema)
  .action(async ({ parsedInput }) => {
    try {
      const {
        dateStart,
        dateEnd,
        modelId,
        status,
        type,
        userId,
        channel,
        search,
        pageIndex,
        pageSize,
        sorting,
      } = parsedInput;

      // Build where conditions
      const conditions = [];

      // Date range filter
      conditions.push(gte(asset.createdAt, new Date(dateStart)));
      conditions.push(lt(asset.createdAt, new Date(dateEnd)));

      // Model filter
      if (modelId) {
        conditions.push(eq(asset.modelId, modelId));
      }

      // Status filter - map friendly names to actual DB values
      if (status) {
        if (status === 'succeeded') {
          conditions.push(inArray(asset.status, SUCCEEDED_STATUSES));
        } else if (status === 'failed') {
          conditions.push(inArray(asset.status, FAILED_STATUSES));
        } else if (status === 'in_progress') {
          conditions.push(inArray(asset.status, IN_PROGRESS_STATUSES));
        }
      }

      // Type filter
      if (type) {
        conditions.push(eq(asset.type, type));
      }

      // User ID filter
      if (userId) {
        conditions.push(eq(asset.userId, userId));
      }

      // Channel filter - query the dedicated channel column
      if (channel) {
        conditions.push(eq(asset.channel, channel));
      }

      // User search - ilike on user.name or user.email
      if (search) {
        conditions.push(
          or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`))
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const offset = pageIndex * pageSize;

      // Sort configuration
      const sortConfig = sorting[0];
      const sortField = sortConfig?.id
        ? sortFieldMap[sortConfig.id as keyof typeof sortFieldMap]
        : asset.createdAt;
      const sortDirection = sortConfig?.desc !== false ? desc : asc;

      const db = await getDb();

      // Query with join to get user info
      let [items, [{ count }]] = await Promise.all([
        db
          .select({
            id: asset.id,
            userId: asset.userId,
            type: asset.type,
            status: asset.status,
            title: asset.title,
            prompt: asset.prompt,
            optimizedPrompt: asset.optimizedPrompt,
            modelId: asset.modelId,
            channel: asset.channel,
            mode: asset.mode,
            aspectRatio: asset.aspectRatio,
            resolution: asset.resolution,
            durationSeconds: asset.durationSeconds,
            creditsUsed: asset.creditsUsed,
            errorMessage: asset.errorMessage,
            outputImageUrls: asset.outputImageUrls,
            outputImageUrlsR2: asset.outputImageUrlsR2,
            outputVideoUrl: asset.outputVideoUrl,
            outputVideoUrlR2: asset.outputVideoUrlR2,
            thumbnailUrl: asset.thumbnailUrl,
            inputImageUrls: asset.inputImageUrls,
            providerRequestId: asset.providerRequestId,
            metadata: asset.metadata,
            logs: asset.logs,
            metrics: asset.metrics,
            createdAt: asset.createdAt,
            updatedAt: asset.updatedAt,
            userName: user.name,
            userEmail: user.email,
          })
          .from(asset)
          .leftJoin(user, eq(asset.userId, user.id))
          .where(where)
          .orderBy(sortDirection(sortField))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(asset)
          .leftJoin(user, eq(asset.userId, user.id))
          .where(where),
      ]);

      // Hide user data in demo website
      const isDemo = isDemoWebsite();
      if (isDemo) {
        items = items.map((item) => ({
          ...item,
          userName: 'Demo User',
          userEmail: 'example@mksaas.com',
          userId: 'demo_user_123',
        }));
      }

      return {
        success: true,
        data: {
          items,
          total: Number(count),
        },
      };
    } catch (error) {
      console.error('get generations error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch generations',
      };
    }
  });

// --------------------------------------------------------------------------
// 2. getGenerationStatsAction - stats with comparison period
// --------------------------------------------------------------------------

const getGenerationStatsSchema = z.object({
  dateStart: z.string(),
  dateEnd: z.string(),
});

export const getGenerationStatsAction = adminActionClient
  .schema(getGenerationStatsSchema)
  .action(async ({ parsedInput }) => {
    try {
      const { dateStart, dateEnd } = parsedInput;

      const start = new Date(dateStart);
      const end = new Date(dateEnd);

      // Calculate the comparison period (same duration, immediately before)
      const durationMs = end.getTime() - start.getTime();
      const comparisonStart = new Date(start.getTime() - durationMs);
      const comparisonEnd = new Date(start.getTime());

      const db = await getDb();

      // Query current period counts
      const [currentStats, comparisonStats] = await Promise.all([
        db
          .select({
            total: sql<number>`count(*)`,
            succeeded: sql<number>`count(*) filter (where ${asset.status} in ('COMPLETED', 'SAVED_TO_R2'))`,
            failed: sql<number>`count(*) filter (where ${asset.status} = 'FAILED')`,
            inProgress: sql<number>`count(*) filter (where ${asset.status} in ('PENDING', 'IN_QUEUE', 'IN_PROGRESS'))`,
          })
          .from(asset)
          .where(and(gte(asset.createdAt, start), lt(asset.createdAt, end))),
        db
          .select({
            total: sql<number>`count(*)`,
            succeeded: sql<number>`count(*) filter (where ${asset.status} in ('COMPLETED', 'SAVED_TO_R2'))`,
            failed: sql<number>`count(*) filter (where ${asset.status} = 'FAILED')`,
          })
          .from(asset)
          .where(
            and(
              gte(asset.createdAt, comparisonStart),
              lt(asset.createdAt, comparisonEnd)
            )
          ),
      ]);

      const current = currentStats[0];
      const comparison = comparisonStats[0];

      const currentTotal = Number(current.total);
      const currentSucceeded = Number(current.succeeded);
      const currentFailed = Number(current.failed);
      const currentInProgress = Number(current.inProgress);
      const currentSuccessRate =
        currentSucceeded + currentFailed > 0
          ? (currentSucceeded / (currentSucceeded + currentFailed)) * 100
          : 0;

      const compTotal = Number(comparison.total);
      const compSucceeded = Number(comparison.succeeded);
      const compFailed = Number(comparison.failed);
      const compSuccessRate =
        compSucceeded + compFailed > 0
          ? (compSucceeded / (compSucceeded + compFailed)) * 100
          : 0;

      return {
        success: true,
        data: {
          total: currentTotal,
          succeeded: currentSucceeded,
          failed: currentFailed,
          inProgress: currentInProgress,
          successRate: Math.round(currentSuccessRate * 100) / 100,
          comparison: {
            total: compTotal,
            succeeded: compSucceeded,
            failed: compFailed,
            successRate: Math.round(compSuccessRate * 100) / 100,
          },
        },
      };
    } catch (error) {
      console.error('get generation stats error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch generation statistics',
      };
    }
  });

// --------------------------------------------------------------------------
// 3. getModelSuccessRatesAction - per-model breakdown
// --------------------------------------------------------------------------

const getModelSuccessRatesSchema = z.object({
  dateStart: z.string(),
  dateEnd: z.string(),
});

export const getModelSuccessRatesAction = adminActionClient
  .schema(getModelSuccessRatesSchema)
  .action(async ({ parsedInput }) => {
    try {
      const { dateStart, dateEnd } = parsedInput;

      const db = await getDb();

      const rows = await db
        .select({
          modelId: asset.modelId,
          channel: asset.channel,
          total: sql<number>`count(*)`,
          succeeded: sql<number>`count(*) filter (where ${asset.status} in ('COMPLETED', 'SAVED_TO_R2'))`,
          failed: sql<number>`count(*) filter (where ${asset.status} = 'FAILED')`,
        })
        .from(asset)
        .where(
          and(
            gte(asset.createdAt, new Date(dateStart)),
            lt(asset.createdAt, new Date(dateEnd))
          )
        )
        .groupBy(asset.modelId, asset.channel);

      const results = rows
        .map((row) => {
          const total = Number(row.total);
          const succeeded = Number(row.succeeded);
          const failed = Number(row.failed);
          const successRate =
            succeeded + failed > 0
              ? Math.round((succeeded / (succeeded + failed)) * 100 * 100) / 100
              : 0;

          return {
            modelId: row.modelId,
            channel: row.channel,
            total,
            succeeded,
            failed,
            successRate,
          };
        })
        .sort((a, b) => a.successRate - b.successRate);

      return {
        success: true,
        data: results,
      };
    } catch (error) {
      console.error('get model success rates error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch model success rates',
      };
    }
  });
