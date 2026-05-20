import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { s3mini } from 's3mini';

const {
  STORAGE_ENDPOINT,
  STORAGE_BUCKET_NAME,
  STORAGE_REGION,
  STORAGE_ACCESS_KEY_ID,
  STORAGE_SECRET_ACCESS_KEY,
} = process.env;

if (
  !STORAGE_ENDPOINT ||
  !STORAGE_BUCKET_NAME ||
  !STORAGE_ACCESS_KEY_ID ||
  !STORAGE_SECRET_ACCESS_KEY
) {
  throw new Error('Missing STORAGE_* env vars');
}

const trimmed = STORAGE_ENDPOINT.replace(/\/$/, '');
const endpoint = trimmed.endsWith(`/${STORAGE_BUCKET_NAME}`)
  ? trimmed
  : `${trimmed}/${STORAGE_BUCKET_NAME}`;

const client = new s3mini({
  accessKeyId: STORAGE_ACCESS_KEY_ID,
  secretAccessKey: STORAGE_SECRET_ACCESS_KEY,
  endpoint,
  region: STORAGE_REGION || 'auto',
});

const DIR = '/tmp/homepage-posters';
const POSTERS = [
  { file: 'landing-hero.jpg', key: 'landing-hero.jpg' },
  { file: 'world-understanding.jpg', key: 'world-understanding.jpg' },
  { file: 'reference-anying.jpg', key: 'reference-anying.jpg' },
  { file: 'con-editing.jpg', key: 'con-editing.jpg' },
  { file: 'landingpage/loading.jpg', key: 'landingpage/loading.jpg' },
];

for (const p of POSTERS) {
  const buf = readFileSync(join(DIR, p.file));
  const res = await client.putObject(p.key, buf, 'image/jpeg');
  if (!res.ok) {
    throw new Error(`Upload ${p.key} failed: ${res.status} ${res.statusText}`);
  }
  console.log(`✓ ${p.key} (${buf.length} bytes)`);
}
