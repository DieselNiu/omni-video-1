'use client';

import { Button } from '@/components/ui/button';
import { useCaptchaGatedUpload } from '@/hooks/use-captcha-gated-upload';
import {
  isOptimisticRole,
  useDeleteRole,
  useResubmitRoleModeration,
  useRoles,
  useUploadRole,
} from '@/hooks/use-roles';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/roles/types';
import { Ban, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';
import { toast } from 'sonner';

type Status = NonNullable<UserRole['moderation']>['seedance'] extends infer S
  ? S extends { status: infer T }
    ? T
    : never
  : never;

function StatusBadge({ status }: { status?: Status }) {
  const t = useTranslations('Dashboard.settings.roles.status');
  if (!status) return null;
  const styles =
    status === 'safe'
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : status === 'flagged'
        ? 'bg-red-500/10 text-red-600 dark:text-red-400'
        : 'bg-muted text-muted-foreground';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        styles
      )}
    >
      {status === 'pending' && <Loader2 className="size-3 animate-spin" />}
      {status === 'flagged' && <Ban className="size-3" />}
      {t(status)}
    </span>
  );
}

export function RolesManager() {
  const t = useTranslations('Dashboard.settings.roles');
  const { data: roles, isLoading } = useRoles();
  const deleteRole = useDeleteRole();
  const uploadRole = useUploadRole();
  const resubmit = useResubmitRoleModeration();
  const { uploadWithCaptcha, captchaDialog } = useCaptchaGatedUpload();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      try {
        await uploadRole(file, uploadWithCaptcha);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed');
      }
    },
    [uploadRole, uploadWithCaptcha]
  );

  const handleDelete = useCallback(
    (id: string) => {
      // eslint-disable-next-line no-alert -- intentional native confirm for a destructive action
      if (!window.confirm(t('delete.confirm'))) return;
      deleteRole.mutate(id, {
        onSuccess: () => toast.success(t('delete.success')),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : t('delete.fail')),
      });
    },
    [deleteRole, t]
  );

  return (
    <div className="space-y-6">
      {captchaDialog}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />

      <div className="flex items-center justify-end">
        <Button onClick={handleAdd} className="gap-2">
          <Plus className="size-4" />
          {t('addRole')}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
              key={i}
              className="aspect-square animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : !roles || roles.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {roles.map((r) => {
            const status = r.moderation?.seedance?.status;
            const uploading = isOptimisticRole(r);
            return (
              <div
                key={r.id}
                className="group/card relative overflow-hidden rounded-lg border bg-card shadow-sm"
              >
                <div className="relative aspect-square overflow-hidden bg-muted">
                  <img
                    src={r.thumbUrl}
                    alt={r.name}
                    className={cn(
                      'size-full object-cover',
                      status === 'flagged' && 'grayscale',
                      uploading && 'opacity-60'
                    )}
                    loading="lazy"
                    decoding="async"
                  />
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Loader2 className="size-6 animate-spin text-white" />
                    </div>
                  )}
                  {!uploading && status === 'pending' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Loader2 className="size-6 animate-spin text-white" />
                    </div>
                  )}
                  {status === 'flagged' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-500/30">
                      <Ban className="size-7 text-white" />
                    </div>
                  )}
                  {!uploading && (
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      aria-label="Delete"
                      className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover/card:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  <StatusBadge status={status} />
                </div>
                {status === 'flagged' && r.moderation?.seedance?.reason && (
                  <div className="px-3 pb-2 text-[11px] text-red-600 dark:text-red-400">
                    {r.moderation.seedance.reason}
                  </div>
                )}
                {/* Resubmit moderation: shown when the role has either
                 *  no moderation entry yet (legacy / Seedance was off)
                 *  or was previously flagged. */}
                {!uploading &&
                  (r.moderation?.seedance == null || status === 'flagged') && (
                    <div className="px-3 pb-3">
                      <button
                        type="button"
                        onClick={() =>
                          resubmit.mutate(r.id, {
                            onError: (err) =>
                              toast.error(
                                err instanceof Error
                                  ? err.message
                                  : 'Resubmit failed'
                              ),
                          })
                        }
                        disabled={resubmit.isPending}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border bg-secondary/60 px-2.5 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-60"
                      >
                        <RefreshCw
                          className={cn(
                            'size-3.5',
                            resubmit.isPending && 'animate-spin'
                          )}
                        />
                        Resubmit
                      </button>
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
