/**
 * Public role shape returned by API + consumed by the panel. Mirrors
 * the DB row but drops infra fields (isDelete, raw timestamps as Date)
 * so it serialises cleanly through JSON.
 */
export interface UserRole {
  id: string;
  name: string;
  imageUrl: string;
  thumbUrl: string;
  moderation: RoleModeration | null;
  createdAt: string;
}

export interface RoleModeration {
  seedance?: {
    externalAssetId?: string;
    status: 'pending' | 'safe' | 'flagged';
    submittedAt?: string;
    checkedAt?: string;
    reason?: string;
  };
}
