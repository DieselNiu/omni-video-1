'use server';

import type { User } from '@/lib/auth-types';
import { userActionClient } from '@/lib/safe-action';
import { deleteFile } from '@/storage';
import { UPLOAD_INTENTS } from '@/storage/intents';
import { z } from 'zod';

const schema = z.object({
  previousUrl: z.string().url(),
});

const AVATAR_FOLDER = UPLOAD_INTENTS.avatar.folder;

/**
 * Delete a user's previous avatar object from storage.
 *
 * Safety: avatar keys are scoped under `avatars/{userId}/...`, so we
 * only allow deletion when the URL falls under the *caller's* own user
 * folder. Legacy avatars under the flat `avatars/...` prefix (uploaded
 * before the scoped layout) are silently skipped rather than deleted,
 * because we can't prove ownership of them.
 */
export const deletePreviousAvatarAction = userActionClient
  .schema(schema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      const { previousUrl } = parsedInput;
      const currentUser = (ctx as { user: User }).user;

      const publicUrl =
        process.env.STORAGE_PUBLIC_URL?.replace(/\/$/, '') ?? '';
      const endpoint = process.env.STORAGE_ENDPOINT?.replace(/\/$/, '') ?? '';
      const base = publicUrl || endpoint;
      if (!base) {
        return { success: false, error: 'Storage not configured' };
      }

      const ownedPrefix = `${base}/${AVATAR_FOLDER}/${currentUser.id}/`;
      if (!previousUrl.startsWith(ownedPrefix)) {
        return { success: true, skipped: true as const };
      }

      const key = previousUrl.slice(base.length + 1);
      await deleteFile(key);
      return { success: true, deleted: true as const };
    } catch (error) {
      console.error('delete previous avatar error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to delete previous avatar',
      };
    }
  });
