import { randomUUID } from 'node:crypto';
import { auth } from '@/lib/auth';
import {
  registerRoleWithSeedance,
  syncPendingRoles,
} from '@/roles/business/moderation';
import { createUserRole, listUserRoles } from '@/roles/data/role';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * GET /api/roles — list the authenticated user's roles (newest first).
 * Soft-deleted rows are filtered server-side.
 */
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const roles = await listUserRoles(session.user.id);
    // Opportunistic refresh: if any rows are pending Seedance moderation,
    // batch-poll their current state in the same round-trip. Costs at
    // most one upstream call per list request and only when needed.
    const refreshed = await syncPendingRoles(roles);
    return NextResponse.json({ success: true, roles: refreshed });
  } catch (error) {
    console.error('List roles error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

const CreateRoleSchema = z.object({
  name: z.string().trim().min(1).max(40),
  imageUrl: z.string().url(),
  thumbUrl: z.string().url(),
});

/**
 * POST /api/roles — register a role row after the client has uploaded
 * the original + thumbnail to R2. The route trusts that the URLs came
 * from `uploadFileFromBrowser` (which gates size/mime/captcha) and
 * doesn't re-fetch them — adding bytes-level validation belongs in a
 * separate moderation pass, not the create path.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = CreateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input' },
        { status: 400 }
      );
    }

    const role = await createUserRole({
      id: randomUUID(),
      userId: session.user.id,
      name: parsed.data.name,
      imageUrl: parsed.data.imageUrl,
      thumbUrl: parsed.data.thumbUrl,
    });

    // Submit to Seedance for moderation. Awaited because the upload call
    // is a single small JSON POST and we want the assetId back before
    // returning. If it fails the role still exists with no moderation
    // field — the next list call retries.
    await registerRoleWithSeedance({
      id: role.id,
      imageUrl: role.imageUrl,
    });

    // Re-fetch so the response includes any moderation patch written by
    // registerRoleWithSeedance (`pending` status + externalAssetId).
    const [withModeration] = await listUserRoles(session.user.id).then((rs) =>
      rs.filter((r) => r.id === role.id)
    );

    return NextResponse.json(
      { success: true, role: withModeration ?? role },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create role error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
