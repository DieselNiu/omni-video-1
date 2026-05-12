'use server';

import { getDb } from '@/db';
import { asset, creditTransaction, user } from '@/db/schema';
import { adminActionClient } from '@/lib/safe-action';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

// Define the schema for getUserCreditTransactions parameters
const getUserCreditTransactionsSchema = z.object({
  userId: z.string(),
  pageIndex: z.number().min(0).default(0),
  pageSize: z.number().min(1).max(100).default(10),
  type: z.string().optional().default(''),
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

// Define sort field mapping
const sortFieldMap = {
  type: creditTransaction.type,
  description: creditTransaction.description,
  amount: creditTransaction.amount,
  remainingAmount: creditTransaction.remainingAmount,
  paymentId: creditTransaction.paymentId,
  expirationDate: creditTransaction.expirationDate,
  createdAt: creditTransaction.createdAt,
} as const;

// Create a safe action for getting user credit transactions
export const getUserCreditTransactionsAction = adminActionClient
  .schema(getUserCreditTransactionsSchema)
  .action(async ({ parsedInput }) => {
    try {
      const { userId, pageIndex, pageSize, type, sorting } = parsedInput;

      const offset = pageIndex * pageSize;

      // Get the sort configuration
      const sortConfig = sorting[0];
      const sortField = sortConfig?.id
        ? sortFieldMap[sortConfig.id as keyof typeof sortFieldMap]
        : creditTransaction.createdAt;
      const sortDirection = sortConfig?.desc ? desc : asc;

      const db = await getDb();

      // Get user info
      const userInfo = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

      if (userInfo.length === 0) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      // Build where conditions
      const conditions = [eq(creditTransaction.userId, userId)];
      if (type) {
        conditions.push(eq(creditTransaction.type, type));
      }

      const whereClause =
        conditions.length === 1
          ? conditions[0]
          : sql`${conditions[0]} AND ${conditions[1]}`;

      const [items, [{ count }]] = await Promise.all([
        db
          .select({
            id: creditTransaction.id,
            userId: creditTransaction.userId,
            type: creditTransaction.type,
            description: creditTransaction.description,
            amount: creditTransaction.amount,
            remainingAmount: creditTransaction.remainingAmount,
            paymentId: creditTransaction.paymentId,
            expirationDate: creditTransaction.expirationDate,
            createdAt: creditTransaction.createdAt,
            assetId: creditTransaction.assetId,
            assetType: asset.type,
            assetStatus: asset.status,
            outputImageUrls: asset.outputImageUrls,
            outputImageUrlsR2: asset.outputImageUrlsR2,
            outputVideoUrl: asset.outputVideoUrl,
            outputVideoUrlR2: asset.outputVideoUrlR2,
          })
          .from(creditTransaction)
          .leftJoin(asset, eq(creditTransaction.assetId, asset.id))
          .where(whereClause)
          .orderBy(sortDirection(sortField))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql`count(*)` })
          .from(creditTransaction)
          .where(whereClause),
      ]);

      return {
        success: true,
        data: {
          user: userInfo[0],
          items,
          total: Number(count),
        },
      };
    } catch (error) {
      console.error('get user credit transactions error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch credit transactions',
      };
    }
  });
