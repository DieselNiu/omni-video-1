import { auth } from '@/lib/auth';
import { registerRoleWithSeedance } from '@/roles/business/moderation';
import { getUserRoleById } from '@/roles/data/role';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/roles/[id]/moderate
 *
 * Manually re-run Seedance moderation for a role. Useful when:
 *   - the role was created while SEEDANCE_API_KEY wasn't configured
 *     (moderation field is null), so it never went through review
 *   - the previous attempt landed `flagged` and the user wants to retry
 *
 * Idempotent: `registerRoleWithSeedance` will overwrite any existing
 * `moderation.seedance` entry with the latest result.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const role = await getUserRoleById({
      userId: session.user.id,
      roleId: id,
    });
    if (!role) {
      return NextResponse.json(
        { success: false, error: 'Role not found' },
        { status: 404 }
      );
    }

    await registerRoleWithSeedance({ id: role.id, imageUrl: role.imageUrl });

    // Return the freshly-updated row so the client can swap it into the
    // list cache without another round-trip.
    const updated = await getUserRoleById({
      userId: session.user.id,
      roleId: id,
    });
    return NextResponse.json({ success: true, role: updated ?? role });
  } catch (error) {
    console.error('Moderate role error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
