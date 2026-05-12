'use server';

import { getDb } from '@/db';
import { payment, user } from '@/db/schema';
import { isDemoWebsite } from '@/lib/demo';
import { adminActionClient } from '@/lib/safe-action';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';

// Define the schema for getPayments parameters
const getPaymentsSchema = z.object({
  pageIndex: z.number().min(0).default(0),
  pageSize: z.number().min(1).max(100).default(10),
  search: z.string().optional().default(''),
  status: z.string().optional().default(''),
  type: z.string().optional().default(''),
  scene: z.string().optional().default(''),
  provider: z.string().optional().default(''),
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
  createdAt: payment.createdAt,
  status: payment.status,
  type: payment.type,
  scene: payment.scene,
  provider: payment.provider,
  periodStart: payment.periodStart,
  periodEnd: payment.periodEnd,
} as const;

// Create a safe action for getting payments
export const getPaymentsAction = adminActionClient
  .schema(getPaymentsSchema)
  .action(async ({ parsedInput }) => {
    try {
      const {
        pageIndex,
        pageSize,
        search,
        status,
        type,
        scene,
        provider,
        sorting,
      } = parsedInput;

      // Build where conditions
      const conditions = [];

      // Search by user email or customerId
      if (search) {
        conditions.push(
          or(
            ilike(payment.customerId, `%${search}%`),
            ilike(user.email, `%${search}%`),
            ilike(user.name, `%${search}%`)
          )
        );
      }

      // Filter by status
      if (status) {
        conditions.push(eq(payment.status, status));
      }

      // Filter by type
      if (type) {
        conditions.push(eq(payment.type, type));
      }

      // Filter by scene
      if (scene) {
        conditions.push(eq(payment.scene, scene));
      }

      // Filter by provider
      if (provider) {
        conditions.push(eq(payment.provider, provider));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const offset = pageIndex * pageSize;

      // Get the sort configuration
      const sortConfig = sorting[0];
      const sortField = sortConfig?.id
        ? sortFieldMap[sortConfig.id as keyof typeof sortFieldMap]
        : payment.createdAt;
      const sortDirection = sortConfig?.desc !== false ? desc : asc;

      const db = await getDb();

      // Query with join to get user info
      let [items, [{ count }]] = await Promise.all([
        db
          .select({
            id: payment.id,
            priceId: payment.priceId,
            type: payment.type,
            scene: payment.scene,
            interval: payment.interval,
            userId: payment.userId,
            customerId: payment.customerId,
            subscriptionId: payment.subscriptionId,
            sessionId: payment.sessionId,
            invoiceId: payment.invoiceId,
            status: payment.status,
            paid: payment.paid,
            periodStart: payment.periodStart,
            periodEnd: payment.periodEnd,
            cancelAtPeriodEnd: payment.cancelAtPeriodEnd,
            trialStart: payment.trialStart,
            trialEnd: payment.trialEnd,
            createdAt: payment.createdAt,
            updatedAt: payment.updatedAt,
            provider: payment.provider,
            paypalSubscriptionId: payment.paypalSubscriptionId,
            paypalOrderId: payment.paypalOrderId,
            userName: user.name,
            userEmail: user.email,
          })
          .from(payment)
          .leftJoin(user, eq(payment.userId, user.id))
          .where(where)
          .orderBy(sortDirection(sortField))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql`count(*)` })
          .from(payment)
          .leftJoin(user, eq(payment.userId, user.id))
          .where(where),
      ]);

      // Hide user data in demo website
      const isDemo = isDemoWebsite();
      if (isDemo) {
        items = items.map((item) => ({
          ...item,
          userName: 'Demo User',
          userEmail: 'example@mksaas.com',
          customerId: 'cus_demo123456',
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
      console.error('get payments error:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch payments',
      };
    }
  });
