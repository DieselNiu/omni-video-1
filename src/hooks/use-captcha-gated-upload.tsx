'use client';

import { Captcha } from '@/components/shared/captcha';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CaptchaRequiredError,
  type UploadOptions,
  uploadFileFromBrowser,
} from '@/storage/client';
import type { UploadIntent } from '@/storage/intents';
import type { UploadFileResult } from '@/storage/types';
import { useCallback, useRef, useState } from 'react';

interface PendingChallenge {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
  tokenInvalid: boolean;
}

interface CaptchaGatedUploadHook {
  uploadWithCaptcha: (
    file: File,
    intent: UploadIntent,
    opts?: UploadOptions
  ) => Promise<UploadFileResult>;
  captchaDialog: React.ReactNode;
}

/**
 * Wraps `uploadFileFromBrowser` so that a server-issued captcha
 * challenge (428) is handled transparently by the caller: the hook
 * shows a Turnstile dialog, waits for a token, and retries the upload
 * with the token. A single dialog instance is hoisted to whatever
 * component mounts the hook — include `captchaDialog` in its JSX.
 */
export function useCaptchaGatedUpload(): CaptchaGatedUploadHook {
  const [pending, setPending] = useState<PendingChallenge | null>(null);
  const pendingRef = useRef<PendingChallenge | null>(null);
  pendingRef.current = pending;

  const uploadWithCaptcha = useCallback(
    async (file: File, intent: UploadIntent, opts?: UploadOptions) => {
      const MAX_CAPTCHA_ATTEMPTS = 3;
      let currentOpts = opts;

      for (let attempt = 0; attempt <= MAX_CAPTCHA_ATTEMPTS; attempt++) {
        try {
          return await uploadFileFromBrowser(file, intent, currentOpts);
        } catch (error) {
          if (!(error instanceof CaptchaRequiredError)) throw error;
          if (!error.siteKey) throw error;
          if (attempt >= MAX_CAPTCHA_ATTEMPTS) throw error;

          const token = await new Promise<string>((resolve, reject) => {
            setPending({
              resolve,
              reject,
              tokenInvalid: error.tokenInvalid,
            });
          });
          setPending(null);
          currentOpts = { ...currentOpts, captchaToken: token };
        }
      }

      throw new Error('Captcha retries exhausted');
    },
    []
  );

  const handleOpenChange = useCallback((open: boolean) => {
    if (open) return;
    const current = pendingRef.current;
    if (current) {
      current.reject(new Error('Captcha dismissed'));
    }
    setPending(null);
  }, []);

  const handleSuccess = useCallback((token: string) => {
    const current = pendingRef.current;
    if (current) {
      current.resolve(token);
    }
  }, []);

  const captchaDialog = (
    <Dialog open={!!pending} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Please verify you're human</DialogTitle>
          <DialogDescription>
            {pending?.tokenInvalid
              ? 'Verification failed — please try again.'
              : 'We noticed unusual upload activity from your connection. Complete the check to continue.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-2">
          <Captcha onSuccess={handleSuccess} />
        </div>
      </DialogContent>
    </Dialog>
  );

  return { uploadWithCaptcha, captchaDialog };
}
