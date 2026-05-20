/**
 * Seedance (sd2_manxue) asset moderation/upload client.
 *
 * Two endpoints:
 *   POST /asset/sd2Manxue/assetUpload   — submit URLs for moderation,
 *                                          returns provider-side assetIds
 *   POST /asset/sd2Manxue/assetStatus   — batch-check moderation status
 *                                          of previously-submitted assets
 *
 * Auth: Bearer token via SEEDANCE_API_KEY env var.
 * Base URL: SEEDANCE_BASE_URL env var (defaults to the production host).
 *
 * Generation-time reference shape: when an assetId is Active, callers
 * should embed it as `asset://{assetId}` rather than the original URL.
 */

export type SeedanceAssetStatus =
  | 'submitted'
  | 'Processing'
  | 'Active'
  | 'Failed';

/** Canonical statuses we store in our DB — the API uses both
 *  `submitted` (immediately after upload) and `Processing` (mid-review)
 *  to mean "not done yet", so we collapse them to `pending`. */
export type NormalisedStatus = 'pending' | 'safe' | 'flagged';

export function normaliseStatus(s: SeedanceAssetStatus): NormalisedStatus {
  if (s === 'Active') return 'safe';
  if (s === 'Failed') return 'flagged';
  return 'pending';
}

interface UploadItem {
  assetType: 'Image' | 'Video' | 'Audio';
  originalUrl: string;
  assetId: string;
  status: SeedanceAssetStatus;
}

interface FailedItem {
  /** Present on /assetUpload */
  originalUrl?: string;
  /** Present on /assetStatus */
  assetId?: string;
  errorMessage?: string;
}

interface SeedanceEnvelope<T> {
  /** The upstream gateway is inconsistent: docs show `"0"` (string)
   *  but the live response uses `0` (number). We accept both. */
  code: string | number;
  msg: string | null;
  data: T | null;
}

export interface AssetUploadResponse {
  items: UploadItem[];
  failedItems: FailedItem[];
}

export interface AssetStatusResponse {
  items: { assetId: string; status: SeedanceAssetStatus }[];
  failedItems: FailedItem[];
}

const DEFAULT_BASE_URL = 'https://zcbservice.aizfw.cn/kyyReactApiServer';

function getEnv() {
  const baseUrl = process.env.SEEDANCE_BASE_URL || DEFAULT_BASE_URL;
  const apiKey = process.env.SEEDANCE_API_KEY;
  return { baseUrl, apiKey };
}

export function isSeedanceConfigured(): boolean {
  return !!process.env.SEEDANCE_API_KEY;
}

async function callSeedance<TReq, TRes>(
  path: string,
  body: TReq
): Promise<TRes> {
  const { baseUrl, apiKey } = getEnv();
  if (!apiKey) {
    throw new Error('SEEDANCE_API_KEY is not configured');
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Seedance ${path} HTTP ${res.status}`);
  }

  const envelope = (await res.json()) as SeedanceEnvelope<TRes>;
  if (String(envelope.code) !== '0' || !envelope.data) {
    throw new Error(envelope.msg || `Seedance ${path} code=${envelope.code}`);
  }
  return envelope.data;
}

/**
 * Submit one or more URLs for moderation. The response returns one item
 * per accepted URL plus `failedItems` for anything the upstream couldn't
 * validate. Callers should match items back to inputs by `originalUrl`.
 */
export async function submitAssetUpload(input: {
  imageUrls?: string[];
  videoUrls?: string[];
  audioUrls?: string[];
}): Promise<AssetUploadResponse> {
  return callSeedance<typeof input, AssetUploadResponse>(
    '/asset/sd2Manxue/assetUpload',
    input
  );
}

/** Batch poll status of previously-submitted asset IDs. */
export async function fetchAssetStatuses(
  assetIds: string[]
): Promise<AssetStatusResponse> {
  return callSeedance<{ assetIds: string[] }, AssetStatusResponse>(
    '/asset/sd2Manxue/assetStatus',
    { assetIds }
  );
}
