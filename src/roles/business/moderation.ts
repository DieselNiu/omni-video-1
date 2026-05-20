import { setRoleModerationProvider } from '@/roles/data/role';
import type { UserRole } from '@/roles/types';
import {
  fetchAssetStatuses,
  isSeedanceConfigured,
  normaliseStatus,
  submitAssetUpload,
} from '@/video/providers/seedance/asset-client';

const PROVIDER = 'seedance' as const;

/**
 * Submit a freshly-created role to Seedance for moderation. The role's
 * R2 imageUrl is sent — Seedance fetches it itself. We persist the
 * returned `assetId` and an initial `pending` status; the actual
 * moderation outcome (`Active` / `Failed`) is fetched later via
 * `syncPendingRoles`.
 *
 * Fail-safe: any throw is logged but not propagated. The role row was
 * already inserted by the caller; we don't want a transient Seedance
 * outage to block the user from seeing their role.
 */
export async function registerRoleWithSeedance(role: {
  id: string;
  imageUrl: string;
}): Promise<void> {
  if (!isSeedanceConfigured()) return;

  try {
    const res = await submitAssetUpload({ imageUrls: [role.imageUrl] });
    const item = (res.items ?? []).find(
      (i) => i.originalUrl === role.imageUrl
    );

    if (item) {
      await setRoleModerationProvider({
        roleId: role.id,
        provider: PROVIDER,
        patch: {
          externalAssetId: item.assetId,
          status: normaliseStatus(item.status),
          submittedAt: new Date().toISOString(),
        },
      });
      return;
    }

    const failed = (res.failedItems ?? []).find(
      (f) => f.originalUrl === role.imageUrl
    );
    await setRoleModerationProvider({
      roleId: role.id,
      provider: PROVIDER,
      patch: {
        status: 'flagged',
        reason: failed?.errorMessage || 'Upstream rejected upload',
        submittedAt: new Date().toISOString(),
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[seedance] registerRoleWithSeedance failed:', err);
  }
}

/**
 * Given a freshly-loaded list of roles, look for any that are still
 * `pending` against Seedance and batch-poll their current status. Any
 * status changes are written back to the DB. Mutates a shallow copy of
 * the list with the updated moderation field and returns it so callers
 * can serve fresh data in a single round-trip.
 */
export async function syncPendingRoles(roles: UserRole[]): Promise<UserRole[]> {
  if (!isSeedanceConfigured()) return roles;

  const pending = roles.filter(
    (r) => r.moderation?.seedance?.status === 'pending'
  );
  if (pending.length === 0) return roles;

  const assetIds = pending
    .map((r) => r.moderation?.seedance?.externalAssetId)
    .filter((x): x is string => !!x);
  if (assetIds.length === 0) return roles;

  let res;
  try {
    res = await fetchAssetStatuses(assetIds);
  } catch (err) {
    // Surface as a one-off log; next list call will retry.
    console.error('[seedance] fetchAssetStatuses failed:', err);
    return roles;
  }

  // `failedItems` is documented but the live API sometimes omits it
  // entirely on /assetStatus, so we treat it as optional everywhere.
  const items = res.items ?? [];
  const byAssetId = new Map(items.map((i) => [i.assetId, i.status]));
  const updated = await Promise.all(
    roles.map(async (r) => {
      const id = r.moderation?.seedance?.externalAssetId;
      if (!id || !byAssetId.has(id)) return r;
      const next = normaliseStatus(byAssetId.get(id)!);
      const prev = r.moderation?.seedance?.status;
      if (next === prev) return r;

      const patch = {
        ...r.moderation?.seedance,
        status: next,
        checkedAt: new Date().toISOString(),
      };
      await setRoleModerationProvider({
        roleId: r.id,
        provider: PROVIDER,
        patch,
      });
      return {
        ...r,
        moderation: {
          ...r.moderation,
          seedance: patch as UserRole['moderation'] extends infer M
            ? M extends { seedance?: infer S }
              ? S
              : never
            : never,
        },
      } satisfies UserRole;
    })
  );

  return updated;
}
