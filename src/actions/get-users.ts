'use server';

import { getDb } from '@/db';
import { payment, user, userCredit } from '@/db/schema';
import { isDemoWebsite } from '@/lib/demo';
import { adminActionClient } from '@/lib/safe-action';
import { and, asc, desc, eq, gte, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';

// Type for paid status filter
const paidStatusSchema = z.enum(['all', 'paid', 'free']).default('all');

// Define the schema for getUsers parameters
const getUsersSchema = z.object({
  pageIndex: z.number().min(0).default(0),
  pageSize: z.number().min(1).max(100).default(10),
  search: z.string().optional().default(''),
  paidStatus: paidStatusSchema,
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
  name: user.name,
  email: user.email,
  createdAt: user.createdAt,
  role: user.role,
  banned: user.banned,
  customerId: user.customerId,
  banReason: user.banReason,
  banExpires: user.banExpires,
  credits: userCredit.currentCredits,
} as const;

// Create a safe action for getting users
export const getUsersAction = adminActionClient
  .schema(getUsersSchema)
  .action(async ({ parsedInput }) => {
    try {
      const { pageIndex, pageSize, search, paidStatus, sorting } = parsedInput;

      // Build search condition
      const searchCondition = search
        ? or(
            ilike(user.name, `%${search}%`),
            ilike(user.email, `%${search}%`),
            ilike(user.customerId, `%${search}%`)
          )
        : undefined;

      // Build paid status condition using raw SQL EXISTS for performance
      // Only apply filter when paidStatus is not 'all'
      let paidCondition: ReturnType<typeof sql> | undefined;
      if (paidStatus === 'paid') {
        paidCondition = sql`EXISTS (SELECT 1 FROM ${payment} WHERE ${payment.userId} = ${user.id} AND ${payment.paid} = true)`;
      } else if (paidStatus === 'free') {
        paidCondition = sql`NOT EXISTS (SELECT 1 FROM ${payment} WHERE ${payment.userId} = ${user.id} AND ${payment.paid} = true)`;
      }

      // Combine conditions
      const where =
        searchCondition && paidCondition
          ? and(searchCondition, paidCondition)
          : searchCondition || paidCondition;

      const offset = pageIndex * pageSize;

      // Get the sort configuration
      const sortConfig = sorting[0];
      const sortField = sortConfig?.id
        ? sortFieldMap[sortConfig.id as keyof typeof sortFieldMap]
        : user.createdAt;
      const sortDirection = sortConfig?.desc ? desc : asc;

      const db = await getDb();

      // Get today's start time (00:00:00) in China timezone (UTC+8)
      const now = new Date();
      // Convert current time to China timezone (UTC+8)
      const chinaTimeMs = now.getTime() + 8 * 60 * 60 * 1000; // Add 8 hours
      const chinaDate = new Date(chinaTimeMs);

      // Get start of day in China timezone
      const chinaTodayStart = new Date(
        Date.UTC(
          chinaDate.getUTCFullYear(),
          chinaDate.getUTCMonth(),
          chinaDate.getUTCDate(),
          0,
          0,
          0,
          0
        )
      );

      // Convert back to UTC (subtract 8 hours)
      const todayStart = new Date(
        chinaTodayStart.getTime() - 8 * 60 * 60 * 1000
      );

      let [items, [{ count }], [{ totalUsers }], [{ todayNewUsers }]] =
        await Promise.all([
          db
            .select({
              id: user.id,
              name: user.name,
              email: user.email,
              emailVerified: user.emailVerified,
              image: user.image,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
              role: user.role,
              banned: user.banned,
              banReason: user.banReason,
              banExpires: user.banExpires,
              customerId: user.customerId,
              adminGrantedPro: user.adminGrantedPro,
              adminGrantedProExpiresAt: user.adminGrantedProExpiresAt,
              credits: userCredit.currentCredits,
            })
            .from(user)
            .leftJoin(userCredit, eq(user.id, userCredit.userId))
            .where(where)
            .orderBy(sortDirection(sortField))
            .limit(pageSize)
            .offset(offset),
          db.select({ count: sql`count(*)` }).from(user).where(where),
          db.select({ totalUsers: sql`count(*)` }).from(user),
          db
            .select({ todayNewUsers: sql`count(*)` })
            .from(user)
            .where(gte(user.createdAt, todayStart)),
        ]);

      // hide user data in demo website
      const isDemo = isDemoWebsite();
      if (isDemo) {
        items = items.map((item) => ({
          ...item,
          name: 'Demo User',
          email: 'example@mksaas.com',
          customerId: 'cus_abcdef123456',
          credits: Math.floor(Math.random() * 1000),
        }));
      }

      return {
        success: true,
        data: {
          items,
          total: Number(count),
          totalUsers: Number(totalUsers),
          todayNewUsers: Number(todayNewUsers),
        },
      };
    } catch (error) {
      console.error('get users error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch users',
      };
    }
  });
