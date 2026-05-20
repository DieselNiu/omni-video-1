/**
 * One-shot seed script for the Phase 2c PRESET_ROLES library.
 *
 * What it does:
 *   1. Uploads every public/roles/preset-N.{jpg,png} and -thumb.webp
 *      to R2 at a stable, non-conflicting prefix (`presets/roles/`).
 *      Files at that prefix are intended to be append-only and
 *      hand-curated — there's no UI for deleting them.
 *   2. Calls Seedance `assetUpload` once with all 6 full-res URLs.
 *   3. Prints the resulting Role config block ready to paste into
 *      `src/components/blocks/hero/role-band.tsx` PRESET_ROLES.
 *
 * Re-running the script is safe: PUTs to the same R2 keys overwrite
 * in place, and Seedance allows re-submitting the same URL (it just
 * returns a new assetId — overwrite the constants if so).
 *
 * Required env: STORAGE_*, SEEDANCE_API_KEY, STORAGE_PUBLIC_URL.
 *   node --env-file=.env.local scripts/seed_preset_roles.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { s3mini } from 's3mini';

const ROOT = path.resolve(process.cwd(), 'public/roles');
const PUBLIC = process.env.STORAGE_PUBLIC_URL?.replace(/\/$/, '');
if (!PUBLIC) throw new Error('STORAGE_PUBLIC_URL is required');

// Same dual-format logic as src/storage/provider/s3.ts so both ".../omni"
// and ".../" endpoints work.
const rawEndpoint = (process.env.STORAGE_ENDPOINT || '').replace(/\/$/, '');
const bucket = process.env.STORAGE_BUCKET_NAME;
const endpoint = rawEndpoint.endsWith(`/${bucket}`)
  ? rawEndpoint
  : `${rawEndpoint}/${bucket}`;

const s3 = new s3mini({
  endpoint,
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
  region: process.env.STORAGE_REGION || 'auto',
});

const ROLES = [
  { id: 'preset-1', name: 'Marcus',   imageFile: 'preset-1.jpg' },
  { id: 'preset-2', name: 'Aria',     imageFile: 'preset-2.jpg' },
  { id: 'preset-3', name: 'Whiskers', imageFile: 'preset-3.jpg' },
  { id: 'preset-4', name: 'Buddy',    imageFile: 'preset-4.jpg' },
  { id: 'preset-5', name: 'Bolt',     imageFile: 'preset-5.png' },
  { id: 'preset-6', name: 'Nova',     imageFile: 'preset-6.png' },
];

const mime = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function uploadOne(localName, remoteKey) {
  const buf = fs.readFileSync(path.join(ROOT, localName));
  const ct = mime[path.extname(localName).toLowerCase()];
  const res = await s3.putObject(remoteKey, buf, ct);
  if (!res.ok) throw new Error(`R2 PUT ${remoteKey} failed: ${res.status}`);
  return `${PUBLIC}/${remoteKey}`;
}

console.log('[1/3] Uploading preset files to R2…');
const uploaded = [];
for (const role of ROLES) {
  const thumbLocal = role.imageFile.replace(/\.[^.]+$/, '-thumb.webp');
  const remoteImage = `presets/roles/${role.imageFile}`;
  const remoteThumb = `presets/roles/${thumbLocal}`;
  const imageUrl = await uploadOne(role.imageFile, remoteImage);
  const thumbUrl = await uploadOne(thumbLocal, remoteThumb);
  uploaded.push({ ...role, imageUrl, thumbUrl });
  console.log(`  • ${role.id} → ${remoteImage}`);
}

console.log('[2/3] Submitting all preset images to Seedance for assetIds…');
const seedanceRes = await fetch(
  'https://zcbservice.aizfw.cn/kyyReactApiServer/asset/sd2Manxue/assetUpload',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SEEDANCE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageUrls: uploaded.map((u) => u.imageUrl) }),
  }
).then((r) => r.json());

if (String(seedanceRes.code) !== '0') {
  console.error('Seedance call failed:', seedanceRes);
  process.exit(1);
}

const byUrl = new Map(
  (seedanceRes.data?.items ?? []).map((i) => [i.originalUrl, i])
);
for (const u of uploaded) {
  const item = byUrl.get(u.imageUrl);
  if (!item) {
    console.warn(`  ! no Seedance result for ${u.id}`);
    continue;
  }
  u.seedanceAssetId = item.assetId;
  u.seedanceStatus = item.status; // submitted | Active | Failed
  console.log(`  • ${u.id} → ${item.assetId} (${item.status})`);
}

console.log('\n[3/3] Paste this into PRESET_ROLES (role-band.tsx):\n');
console.log('export const PRESET_ROLES: Role[] = [');
for (const u of uploaded) {
  console.log('  {');
  console.log(`    id: '${u.id}',`);
  console.log(`    name: '${u.name}',`);
  console.log(`    avatarUrl: '${u.thumbUrl}',`);
  console.log(`    imageUrl: '${u.imageUrl}',`);
  console.log(`    seedanceAssetId: '${u.seedanceAssetId}',`);
  console.log(`    moderationStatus: 'safe',`);
  console.log('  },');
}
console.log('];');
