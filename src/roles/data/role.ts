import { getDb } from '@/db';
import { userRole } from '@/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { RoleModeration, UserRole } from '../types';

function mapDbRowToRole(row: typeof userRole.$inferSelect): UserRole {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.imageUrl,
    thumbUrl: row.thumbUrl,
    moderation: (row.moderation as RoleModeration | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getUserRoleById(input: {
  userId: string;
  roleId: string;
}): Promise<UserRole | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(userRole)
    .where(
      and(
        eq(userRole.id, input.roleId),
        eq(userRole.userId, input.userId),
        eq(userRole.isDelete, false)
      )
    )
    .limit(1);
  return rows[0] ? mapDbRowToRole(rows[0]) : null;
}

export async function listUserRoles(userId: string): Promise<UserRole[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(userRole)
    .where(and(eq(userRole.userId, userId), eq(userRole.isDelete, false)))
    .orderBy(desc(userRole.createdAt));
  return rows.map(mapDbRowToRole);
}

export async function createUserRole(input: {
  id: string;
  userId: string;
  name: string;
  imageUrl: string;
  thumbUrl: string;
}): Promise<UserRole> {
  const db = await getDb();
  const [row] = await db
    .insert(userRole)
    .values({
      id: input.id,
      userId: input.userId,
      name: input.name,
      imageUrl: input.imageUrl,
      thumbUrl: input.thumbUrl,
    })
    .returning();
  return mapDbRowToRole(row);
}

/**
 * Merge a partial `moderation` payload into the existing JSONB column.
 * Postgres jsonb concat (`||`) does a shallow merge — we use it so two
 * provider entries (e.g. seedance + sora later) can coexist without
 * reading the row first. Bypasses ownership checks because moderation
 * writes always originate from server code, not user requests.
 */
export async function setRoleModerationProvider(input: {
  roleId: string;
  provider: 'seedance';
  patch: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  // jsonb_set is wrapped so the column can be NULL on first write.
  await db
    .update(userRole)
    .set({
      moderation: sql`
        COALESCE(${userRole.moderation}, '{}'::jsonb)
        || jsonb_build_object(${input.provider}, ${JSON.stringify(input.patch)}::jsonb)
      `,
      updatedAt: new Date(),
    })
    .where(eq(userRole.id, input.roleId));
}

/**
 * Soft-delete: keeps the row so any in-flight generations referencing
 * this role still resolve, and so we can recover from accidental
 * deletions. Hard delete is left for an admin job later.
 */
export async function deleteUserRole(input: {
  userId: string;
  roleId: string;
}): Promise<boolean> {
  const db = await getDb();
  const res = await db
    .update(userRole)
    .set({ isDelete: true, updatedAt: new Date() })
    .where(
      and(eq(userRole.id, input.roleId), eq(userRole.userId, input.userId))
    )
    .returning({ id: userRole.id });
  return res.length > 0;
}
