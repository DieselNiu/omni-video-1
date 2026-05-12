'use client';

import { Captcha } from '@/components/shared/captcha';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCallback, useRef, useState } from 'react';

interface PendingChallenge {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
  tokenInvalid: boolean;
  siteKey: string | null;
}

export class CaptchaDismissedError extends Error {
  constructor() {
    super('Captcha dismissed');
    this.name = 'CaptchaDismissedError';
  }
}

/**
 * Generic Cloudflare Turnstile challenge primitive. The hook owns a
 * single "one challenge at a time" state machine: callers await
 * `presentChallenge()` to get a solved token, the dialog renders a
 * Turnstile widget, and the caller retries whatever triggered the
 * gate with that token.
 *
 * Mount `captchaDialog` somewhere in the consumer's tree for the
 * dialog to render.
 */
export function useCaptchaChallenge() {
  const [pending, setPending] = useState<PendingChallenge | null>(null);
  const pendingRef = useRef<PendingChallenge | null>(null);
  pendingRef.current = pending;

  const presentChallenge = useCallback(
    (
      opts: {
        tokenInvalid?: boolean;
        siteKey?: string | null;
      } = {}
    ) =>
      new Promise<string>((resolve, reject) => {
        // Any previously-pending challenge gets cancelled — only one
        // dialog is ever open at a time.
        const current = pendingRef.current;
        if (current) {
          current.reject(new CaptchaDismissedError());
        }
        setPending({
          resolve,
          reject,
          tokenInvalid: opts.tokenInvalid ?? false,
          siteKey: opts.siteKey ?? null,
        });
      }),
    []
  );

  const handleOpenChange = useCallback((open: boolean) => {
    if (open) return;
    const current = pendingRef.current;
    if (current) {
      current.reject(new CaptchaDismissedError());
    }
    setPending(null);
  }, []);

  const handleSuccess = useCallback((token: string) => {
    const current = pendingRef.current;
    if (current) {
      current.resolve(token);
      setPending(null);
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
              : 'Complete the check to continue.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-2">
          <Captcha onSuccess={handleSuccess} siteKey={pending?.siteKey} />
        </div>
      </DialogContent>
    </Dialog>
  );

  return { presentChallenge, captchaDialog };
}
