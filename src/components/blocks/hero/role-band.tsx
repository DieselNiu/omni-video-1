'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDeleteRole, useUploadRole } from '@/hooks/use-roles';
import { cn } from '@/lib/utils';
import type { UploadFileResult } from '@/storage/types';
import { Ban, Loader2, Trash2, UserPlus, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

export interface Role {
  id: string;
  name: string;
  /** Small thumbnail shown in the band (also used as in-prompt chip avatar). */
  avatarUrl: string;
  /** Full-res image used as `reference_image` when the role is selected. */
  imageUrl: string;
  /** Only user-uploaded roles can be deleted; presets are read-only. */
  isUserUploaded?: boolean;
  /** Moderation state for Seedance — drives the band's status badge and
   *  blocks selection when `flagged`. `safe` (or absent for presets)
   *  means the role can be used without further work. */
  moderationStatus?: 'pending' | 'safe' | 'flagged';
  /** Pre-registered Seedance asset ID. Set for preset roles (seeded
   *  once via scripts/seed_preset_roles.mjs); for user-uploaded roles
   *  it's tracked in DB `moderation.seedance.externalAssetId` and is
   *  hydrated by the operation panel before submitting a generation. */
  seedanceAssetId?: string;
}

/**
 * Frontend-only preset library for Phase 1. Mixed-subject roster so the
 * demo doesn't read as "just human portraits":
 *   - 2 AI-generated faces (StyleGAN)
 *   - 1 CC photo cat (Wikimedia Commons)
 *   - 1 CC photo dog (dog.ceo random pick)
 *   - 1 stylized robot (DiceBear bottts)
 *   - 1 illustrated adventurer (DiceBear adventurer)
 * 128px webp thumbs power the band avatar; the larger originals get
 * sent to the backend as `reference_image` once Phase 2 lands.
 */
// Seeded via scripts/seed_preset_roles.mjs — R2 URLs are stable (PUTs
// overwrite by key) and the assetIds were pre-registered with Seedance
// once so generation can reference `asset://{seedanceAssetId}` without
// waiting for moderation. To rotate art, replace the local file + re-run
// the seed script and paste the output back in here.
export const PRESET_ROLES: Role[] = [
  {
    id: 'preset-1',
    name: 'Marcus',
    avatarUrl:
      'https://assets.gemini-omni.video/presets/roles/preset-1-thumb.webp',
    imageUrl: 'https://assets.gemini-omni.video/presets/roles/preset-1.jpg',
    seedanceAssetId: 'asset-20260520030338-xnvtg',
    moderationStatus: 'safe',
  },
  {
    id: 'preset-2',
    name: 'Aria',
    avatarUrl:
      'https://assets.gemini-omni.video/presets/roles/preset-2-thumb.webp',
    imageUrl: 'https://assets.gemini-omni.video/presets/roles/preset-2.jpg',
    seedanceAssetId: 'asset-20260520030340-62vhj',
    moderationStatus: 'safe',
  },
  {
    id: 'preset-3',
    name: 'Whiskers',
    avatarUrl:
      'https://assets.gemini-omni.video/presets/roles/preset-3-thumb.webp',
    imageUrl: 'https://assets.gemini-omni.video/presets/roles/preset-3.jpg',
    seedanceAssetId: 'asset-20260520030341-zmlzh',
    moderationStatus: 'safe',
  },
  {
    id: 'preset-4',
    name: 'Buddy',
    avatarUrl:
      'https://assets.gemini-omni.video/presets/roles/preset-4-thumb.webp',
    imageUrl: 'https://assets.gemini-omni.video/presets/roles/preset-4.jpg',
    seedanceAssetId: 'asset-20260520030342-nw9v7',
    moderationStatus: 'safe',
  },
  {
    id: 'preset-5',
    name: 'Bolt',
    avatarUrl:
      'https://assets.gemini-omni.video/presets/roles/preset-5-thumb.webp',
    imageUrl: 'https://assets.gemini-omni.video/presets/roles/preset-5.png',
    seedanceAssetId: 'asset-20260520030343-z2qdd',
    moderationStatus: 'safe',
  },
  {
    id: 'preset-6',
    name: 'Nova',
    avatarUrl:
      'https://assets.gemini-omni.video/presets/roles/preset-6-thumb.webp',
    imageUrl: 'https://assets.gemini-omni.video/presets/roles/preset-6.png',
    seedanceAssetId: 'asset-20260520030344-c9cb9',
    moderationStatus: 'safe',
  },
];

/** Caller-supplied uploader so the modal inherits the parent's captcha
 *  challenge dialog and rate-limit window rather than spawning its own. */
type UploadFn = (file: File, intent: 'role-input') => Promise<UploadFileResult>;

interface AddRoleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  upload: UploadFn;
  /** Called after the role row is persisted server-side. */
  onCreated: (role: Role) => void;
}

/**
 * "Starring Roles" modal. Workflow:
 *   1. user picks a file
 *   2. client-side downscale to a 128px square webp thumbnail
 *   3. upload both files in parallel through the captcha-gated route
 *   4. POST /api/roles with the two R2 urls + a derived name
 *   5. surface the new Role to the band so it appears immediately
 * Recording / voice clone is intentionally out of scope.
 */
function AddRoleModal({
  open,
  onOpenChange,
  upload,
  onCreated,
}: AddRoleModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadRole = useUploadRole();

  const handleFile = useCallback(
    async (file: File) => {
      // Close the modal immediately so the user sees their newly-added
      // role appear in the band without waiting on the upload. The
      // optimistic row already lives in the query cache by this point.
      onOpenChange(false);
      try {
        const role = await uploadRole(file, upload);
        onCreated({
          id: role.id,
          name: role.name,
          avatarUrl: role.thumbUrl,
          imageUrl: role.imageUrl,
          isUserUploaded: true,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add role');
      }
    },
    [upload, uploadRole, onCreated, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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

        <div className="flex flex-col items-center gap-4 pt-2 text-center">
          <div className="flex -space-x-3">
            {PRESET_ROLES.slice(0, 5).map((r, i) => (
              <img
                key={r.id}
                src={r.avatarUrl}
                alt={r.name}
                className={cn(
                  'size-14 rounded-full border-2 border-background object-cover',
                  i === 2 && 'size-16'
                )}
              />
            ))}
          </div>
          <DialogTitle className="font-serif text-2xl">
            Starring Roles
          </DialogTitle>
          <DialogDescription className="text-balance text-sm">
            Create the appearance of yourself, anyone, or anything, and reuse
            them as references across videos.
          </DialogDescription>
        </div>

        <DialogFooter className="mt-2 flex-col gap-2 sm:flex-col sm:space-x-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-foreground py-2.5 text-sm font-medium text-background hover:bg-foreground/90"
          >
            Upload Image
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RoleBandProps {
  roles: Role[];
  /** IDs of currently selected roles — selected ones get a ring. */
  selectedRoleIds: string[];
  onSelectRole: (role: Role) => void;
  onAddRole: (role: Role) => void;
  /** Captcha-gated uploader supplied by the panel so the modal shares
   *  one rate-limit window and one Turnstile dialog with everything
   *  else in the operation panel. */
  upload: UploadFn;
  /** Max selections (matches the reference slot cap). When reached,
   *  clicking a non-selected role does nothing. */
  maxSelected?: number;
}

/**
 * Horizontal role bar shown above the expanded operation panel. Hover the
 * whole bar to reveal each role's name below its avatar (matches Wan's
 * collapsed-pill ↔ expanded-pill behavior).
 */
export function RoleBand({
  roles,
  selectedRoleIds,
  onSelectRole,
  onAddRole,
  upload,
  maxSelected = 5,
}: RoleBandProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const deleteRole = useDeleteRole();
  const reachedMax = selectedRoleIds.length >= maxSelected;
  // Pin the band open whenever the user has skin in the game — either
  // a selected role (so the chip stays paired with its band entry) or
  // any user-uploaded role (so newly added entries don't disappear into
  // the overlap stack the moment the cursor leaves).
  const hasUserUploaded = roles.some((r) => r.isUserUploaded);
  const pinned = selectedRoleIds.length > 0 || hasUserUploaded;

  const items: { kind: 'add' | 'role'; role?: Role }[] = [
    { kind: 'add' },
    ...roles.map((r) => ({ kind: 'role' as const, role: r })),
  ];

  return (
    <>
      <div
        className="group/band flex items-start overflow-x-auto pb-1 pl-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-expanded={pinned ? 'true' : undefined}
      >
        {items.map((item, i) => {
          if (item.kind === 'add') {
            return (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-position add tile
                key={`add-${i}`}
                type="button"
                onClick={() => setModalOpen(true)}
                aria-label="Add role"
                className="relative z-10 flex shrink-0 flex-col items-center gap-1"
              >
                <span className="flex size-12 items-center justify-center rounded-full border-2 border-dashed border-foreground/35 bg-background/40 text-muted-foreground backdrop-blur-md transition-colors hover:border-foreground/60 hover:text-foreground">
                  <UserPlus className="size-5" />
                </span>
                {/* Label switches: collapsed shows the section title
                 *  "Reference"; hovered shows the tile's own action
                 *  "Add Role". */}
                <span className="whitespace-nowrap text-[11px] font-medium text-foreground/80">
                  <span className="inline group-hover/band:hidden group-data-[expanded=true]/band:hidden">
                    Reference
                  </span>
                  <span className="hidden group-hover/band:inline group-data-[expanded=true]/band:inline">
                    Add Role
                  </span>
                </span>
              </button>
            );
          }
          const role = item.role as Role;
          const selected = selectedRoleIds.includes(role.id);
          const blocked = role.moderationStatus === 'flagged';
          const pending = role.moderationStatus === 'pending';
          const dimmed = (!selected && reachedMax) || blocked || pending;
          return (
            <div
              key={role.id}
              style={{ zIndex: 9 - i }}
              className={cn(
                'group/role relative -ml-6 flex shrink-0 flex-col items-center gap-1 transition-[margin] duration-200 ease-out group-hover/band:ml-1 group-data-[expanded=true]/band:ml-1'
              )}
            >
              <button
                type="button"
                onClick={() => {
                  if (blocked) {
                    toast.error(`${role.name} didn't pass moderation`);
                    return;
                  }
                  if (pending) {
                    toast(`${role.name} is still under review`);
                    return;
                  }
                  if (!dimmed) onSelectRole(role);
                }}
                className={cn(
                  'block',
                  dimmed && !selected && 'cursor-not-allowed opacity-50'
                )}
              >
                <span
                  className={cn(
                    'relative block size-12 overflow-hidden rounded-full border-2 border-background/80 ring-2 ring-transparent transition-all',
                    selected && 'ring-foreground'
                  )}
                >
                  <img
                    src={role.avatarUrl}
                    alt={role.name}
                    width={96}
                    height={96}
                    className={cn(
                      'size-full object-cover',
                      blocked && 'grayscale'
                    )}
                    loading="lazy"
                    decoding="async"
                  />
                  {pending && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Loader2 className="size-4 animate-spin text-white" />
                    </span>
                  )}
                  {blocked && (
                    <span className="absolute inset-0 flex items-center justify-center bg-red-500/40">
                      <Ban className="size-4 text-white" />
                    </span>
                  )}
                </span>
              </button>
              {role.isUserUploaded && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteRole.mutate(role.id, {
                      onError: (err) =>
                        toast.error(
                          err instanceof Error
                            ? err.message
                            : 'Failed to delete'
                        ),
                    });
                  }}
                  aria-label={`Delete ${role.name}`}
                  className="absolute -right-1 top-0 inline-flex size-5 items-center justify-center rounded-full border border-background/80 bg-foreground/90 text-background opacity-0 transition-opacity hover:bg-foreground group-hover/role:opacity-100"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
              <span className="max-h-0 overflow-hidden whitespace-nowrap text-[11px] font-medium text-muted-foreground opacity-0 transition-[max-height,opacity] duration-200 group-hover/band:max-h-4 group-hover/band:opacity-100 group-data-[expanded=true]/band:max-h-4 group-data-[expanded=true]/band:opacity-100">
                {role.name.length > 8 ? `${role.name.slice(0, 7)}…` : role.name}
              </span>
            </div>
          );
        })}
      </div>

      <AddRoleModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        upload={upload}
        onCreated={onAddRole}
      />
    </>
  );
}

interface RoleChipProps {
  name: string;
  avatarUrl: string;
  onRemove: () => void;
}

/**
 * Compact in-prompt chip rendered above the prompt textarea for each
 * selected reference. Mimics Wan's "@role" tag shown inline.
 */
export function RoleChip({ name, avatarUrl, onRemove }: RoleChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-foreground/[0.06] py-1 pl-1 pr-1.5 text-xs">
      <img
        src={avatarUrl}
        alt={name}
        width={32}
        height={32}
        className="size-5 rounded-full object-cover"
        loading="lazy"
        decoding="async"
      />
      <span className="font-medium text-foreground/85">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
