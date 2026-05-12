import type { UploadIntent } from './intents';
import type { UploadFileResult } from './types';

const API_STORAGE_UPLOAD = '/api/storage/upload/';

export interface UploadOptions {
  /**
   * Cloudflare Turnstile token; only required when the server signals
   * captcha via CaptchaRequiredError on a previous attempt.
   */
  captchaToken?: string;
}

export class CaptchaRequiredError extends Error {
  readonly code = 'captcha_required';
  readonly siteKey: string | null;
  /** true when a token was already submitted and rejected. */
  readonly tokenInvalid: boolean;

  constructor(params: { siteKey: string | null; tokenInvalid: boolean }) {
    super('Upload requires captcha verification');
    this.name = 'CaptchaRequiredError';
    this.siteKey = params.siteKey;
    this.tokenInvalid = params.tokenInvalid;
  }
}

/**
 * Uploads a file from the browser to the storage provider.
 *
 * The server maps `intent` to a fixed storage prefix and auth/mime/size
 * rules; the client cannot pick the destination folder directly.
 *
 * When the server requires a captcha (rate-limit threshold crossed),
 * this throws `CaptchaRequiredError` with the Turnstile site key.
 * The caller is expected to obtain a token via the Turnstile widget
 * and retry with `opts.captchaToken`.
 */
export const uploadFileFromBrowser = async (
  file: File,
  intent: UploadIntent,
  opts?: UploadOptions
): Promise<UploadFileResult> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('intent', intent);
  if (opts?.captchaToken) {
    formData.append('captchaToken', opts.captchaToken);
  }

  const response = await fetch(API_STORAGE_UPLOAD, {
    method: 'POST',
    body: formData,
  });

  if (response.ok) {
    return await response.json();
  }

  if (response.status === 413) {
    throw new Error('File size exceeds the server limit');
  }

  if (response.status === 428) {
    let siteKey: string | null = null;
    let tokenInvalid = false;
    try {
      const data = (await response.json()) as {
        error?: string;
        siteKey?: string | null;
      };
      siteKey = data.siteKey ?? null;
      tokenInvalid = data.error === 'captcha_invalid';
    } catch {
      // fall through with defaults
    }
    throw new CaptchaRequiredError({ siteKey, tokenInvalid });
  }

  let errorMessage = 'Failed to upload file';
  try {
    const errorData = (await response.json()) as {
      error?: string;
      message?: string;
    };
    errorMessage = errorData.error || errorData.message || errorMessage;
  } catch {
    // keep default
  }
  throw new Error(errorMessage);
};
