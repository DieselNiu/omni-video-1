'use client';

import { makeSquareThumbnail } from '@/lib/image-resize';
import type { UserRole } from '@/roles/types';
import type { UploadFileResult } from '@/storage/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export const rolesKeys = {
  all: ['roles'] as const,
  list: () => [...rolesKeys.all, 'list'] as const,
};

interface ListResponse {
  success: boolean;
  roles?: UserRole[];
  error?: string;
}

interface CreateResponse {
  success: boolean;
  role?: UserRole;
  error?: string;
}

export function useRoles({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: rolesKeys.list(),
    enabled,
    queryFn: async (): Promise<UserRole[]> => {
      const res = await fetch('/api/roles');
      const data: ListResponse = await res.json();
      if (!res.ok || !data.success || !data.roles) {
        throw new Error(data.error || 'Failed to fetch roles');
      }
      return data.roles;
    },
    // Poll only while there's at least one role waiting on Seedance,
    // and *not* while there's an in-flight optimistic upload — a refetch
    // mid-upload would clobber the temp row that the band depends on.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      if (data.some(isOptimisticRole)) return false;
      return data.some((r) => r.moderation?.seedance?.status === 'pending')
        ? 5000
        : false;
    },
  });
}

/**
 * Marker on optimistic roles still mid-upload — UI can dim them or
 * render an "uploading…" overlay. The id also starts with `temp-` so
 * any code that needs to skip in-flight rows can filter on it.
 */
export const OPTIMISTIC_ROLE_ID_PREFIX = 'temp-';
export function isOptimisticRole(role: UserRole): boolean {
  return role.id.startsWith(OPTIMISTIC_ROLE_ID_PREFIX);
}

type UploadFn = (file: File, intent: 'role-input') => Promise<UploadFileResult>;

/**
 * Combined upload + create flow with optimistic insertion.
 *
 * Inserts a placeholder row into the list cache the moment the user
 * picks a file (using `URL.createObjectURL` for instant preview), then
 * uploads + POSTs in the background. On settle the placeholder is
 * swapped for the real DB row; on failure it's removed and the error
 * surfaces. The caller still controls the captcha hook so dialogs stay
 * scoped to one component tree.
 */
export function useUploadRole() {
  const qc = useQueryClient();

  return useCallback(
    async (file: File, upload: UploadFn): Promise<UserRole> => {
      const tempId = `${OPTIMISTIC_ROLE_ID_PREFIX}${crypto.randomUUID()}`;
      const previewUrl = URL.createObjectURL(file);
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'My Role';

      // Pretend the row is already in `pending` Seedance status so the
      // band/manager UI renders the same spinner overlay it uses once
      // the server reports its real pending state. This keeps the
      // visual transition seamless: spinner → spinner → safe/flagged.
      // Stop any in-flight refetch — without this a refetchInterval-driven
      // GET that returned mid-upload would clobber the optimistic row.
      // The `refetchInterval` callback also detects optimistic rows and
      // pauses polling, but we still cancel as a belt-and-braces guard.
      await qc.cancelQueries({ queryKey: rolesKeys.list() });

      // Pretend the row is already `pending` against Seedance so the
      // band/manager UI shows the same spinner overlay it would use
      // once the server returns its real pending state.
      const optimistic: UserRole = {
        id: tempId,
        name,
        imageUrl: previewUrl,
        thumbUrl: previewUrl,
        moderation: { seedance: { status: 'pending' } },
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<UserRole[]>(rolesKeys.list(), (prev) =>
        prev ? [optimistic, ...prev] : [optimistic]
      );

      try {
        const thumbFile = await makeSquareThumbnail(file).catch(() => file);
        const [full, thumb] = await Promise.all([
          upload(file, 'role-input'),
          upload(thumbFile, 'role-input'),
        ]);

        const res = await fetch('/api/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            imageUrl: full.url,
            thumbUrl: thumb.url,
          }),
        });
        const data: CreateResponse = await res.json();
        if (!res.ok || !data.success || !data.role) {
          throw new Error(data.error || 'Failed to create role');
        }
        const real = data.role;

        qc.setQueryData<UserRole[]>(
          rolesKeys.list(),
          (prev) => prev?.map((r) => (r.id === tempId ? real : r)) ?? [real]
        );
        URL.revokeObjectURL(previewUrl);
        return real;
      } catch (err) {
        // Roll back the optimistic insert so the band doesn't show a
        // ghost row pointing at a now-revoked object URL.
        qc.setQueryData<UserRole[]>(rolesKeys.list(), (prev) =>
          prev ? prev.filter((r) => r.id !== tempId) : prev
        );
        URL.revokeObjectURL(previewUrl);
        throw err;
      }
    },
    [qc]
  );
}

/**
 * Manually re-trigger Seedance moderation for an existing role —
 * exposed in the settings UI as a "Resubmit" button when a role has
 * either `moderation === null` (registered while Seedance was off) or
 * `moderation.seedance.status === 'flagged'` (rejected, want to retry).
 *
 * On success the server returns the fresh row; we splice it into the
 * list cache so the status badge updates without waiting for the next
 * refetch.
 */
export function useResubmitRoleModeration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roleId: string): Promise<UserRole> => {
      const res = await fetch(`/api/roles/${roleId}/moderate`, {
        method: 'POST',
      });
      const data: CreateResponse = await res.json();
      if (!res.ok || !data.success || !data.role) {
        throw new Error(data.error || 'Resubmit failed');
      }
      return data.role;
    },
    onMutate: async (roleId) => {
      await qc.cancelQueries({ queryKey: rolesKeys.list() });
      const previous = qc.getQueryData<UserRole[]>(rolesKeys.list());
      // Optimistically flip back to pending so the UI shows a spinner
      // immediately — the success/failure write below replaces it.
      qc.setQueryData<UserRole[]>(rolesKeys.list(), (curr) =>
        curr
          ? curr.map((r) =>
              r.id === roleId
                ? {
                    ...r,
                    moderation: {
                      ...r.moderation,
                      seedance: {
                        ...r.moderation?.seedance,
                        status: 'pending',
                        submittedAt: new Date().toISOString(),
                      },
                    },
                  }
                : r
            )
          : curr
      );
      return { previous };
    },
    onSuccess: (role) => {
      qc.setQueryData<UserRole[]>(rolesKeys.list(), (curr) =>
        curr ? curr.map((r) => (r.id === role.id ? role : r)) : curr
      );
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(rolesKeys.list(), ctx.previous);
      }
    },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roleId: string) => {
      const res = await fetch(`/api/roles/${roleId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete role');
      }
      return roleId;
    },
    // Pull the row out of the cache immediately so the band updates in
    // the same tick the user clicks. If the API call fails we restore
    // the prior snapshot.
    onMutate: async (roleId) => {
      await qc.cancelQueries({ queryKey: rolesKeys.list() });
      const previous = qc.getQueryData<UserRole[]>(rolesKeys.list());
      qc.setQueryData<UserRole[]>(rolesKeys.list(), (curr) =>
        curr ? curr.filter((r) => r.id !== roleId) : curr
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(rolesKeys.list(), ctx.previous);
      }
    },
  });
}
