'use server';

import {
  checkNormalizedEmailExists,
  isDisposableEmail,
  isSuspiciousGmail,
} from '@/lib/email-validation';
import { checkDeviceFingerprint } from '@/lib/fingerprint';
import { actionClient } from '@/lib/safe-action';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  fingerprint: z.string().optional(),
});

export const validateRegistrationAction = actionClient
  .schema(schema)
  .action(async ({ parsedInput: { email, fingerprint } }) => {
    // Check disposable email
    if (isDisposableEmail(email)) {
      return { success: false, error: 'disposableEmail' } as const;
    }

    // Check suspicious Gmail patterns (excessive dots, + aliases)
    if (isSuspiciousGmail(email)) {
      return { success: false, error: 'suspiciousGmail' } as const;
    }

    // Check Gmail normalization (same Gmail with dots/+alias)
    if (await checkNormalizedEmailExists(email)) {
      return { success: false, error: 'gmailDuplicate' } as const;
    }

    // Check device fingerprint limit
    if (fingerprint) {
      const { allowed } = await checkDeviceFingerprint(fingerprint);
      if (!allowed) {
        return { success: false, error: 'deviceLimit' } as const;
      }
    }

    return { success: true } as const;
  });
