import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { s3mini } from 's3mini';

loadEnv({ path: '.env.local' });

const BLOG_DIR = 'public/blog';
const CONTENT_DIR = 'content/blog';
const BLOG_PREFIX = 'blog';
const IMAGE_CONTENT_TYPES = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const args = new Set(process.argv.slice(2));
const shouldUpload = args.has('--confirm');
const shouldRewrite = args.has('--rewrite');

const {
  STORAGE_ENDPOINT,
  STORAGE_BUCKET_NAME,
  STORAGE_REGION,
  STORAGE_ACCESS_KEY_ID,
  STORAGE_SECRET_ACCESS_KEY,
  STORAGE_PUBLIC_URL,
} = process.env;

if (
  !STORAGE_ENDPOINT ||
  !STORAGE_BUCKET_NAME ||
  !STORAGE_ACCESS_KEY_ID ||
  !STORAGE_SECRET_ACCESS_KEY ||
  !STORAGE_PUBLIC_URL
) {
  throw new Error('Missing STORAGE_* env vars');
}

const publicUrl = STORAGE_PUBLIC_URL.replace(/\/$/, '');
const endpointBase = STORAGE_ENDPOINT.replace(/\/$/, '');
const endpoint = endpointBase.endsWith(`/${STORAGE_BUCKET_NAME}`)
  ? endpointBase
  : `${endpointBase}/${STORAGE_BUCKET_NAME}`;

const client = new s3mini({
  accessKeyId: STORAGE_ACCESS_KEY_ID,
  secretAccessKey: STORAGE_SECRET_ACCESS_KEY,
  endpoint,
  region: STORAGE_REGION || 'auto',
});

const blogFiles = existsSync(BLOG_DIR)
  ? readdirSync(BLOG_DIR)
      .filter((file) => IMAGE_CONTENT_TYPES[extname(file).toLowerCase()])
      .sort()
  : [];

if (blogFiles.length === 0) {
  console.log(`No uploadable files found in ${BLOG_DIR}`);
  process.exit(0);
}

const uploadedUrls = new Map();

for (const file of blogFiles) {
  const localPath = join(BLOG_DIR, file);
  const key = `${BLOG_PREFIX}/${file}`;
  const url = `${publicUrl}/${key}`;
  uploadedUrls.set(`/blog/${file}`, url);

  if (!shouldUpload) {
    console.log(`[dry-run] ${localPath} -> ${url}`);
    continue;
  }

  const contentType = IMAGE_CONTENT_TYPES[extname(file).toLowerCase()];
  const body = readFileSync(localPath);
  const result = await client.putObject(key, body, contentType);
  if (!result.ok) {
    throw new Error(
      `Upload ${key} failed: ${result.status} ${result.statusText}`
    );
  }
  console.log(`uploaded ${localPath} -> ${url}`);
}

if (!shouldRewrite) {
  if (shouldUpload) {
    console.log(
      'Upload complete. Pass --rewrite to update content/blog/*.mdx.'
    );
  }
  process.exit(0);
}

const mdxFiles = readdirSync(CONTENT_DIR)
  .filter((file) => file.endsWith('.mdx'))
  .sort();

for (const file of mdxFiles) {
  const path = join(CONTENT_DIR, file);
  let content = readFileSync(path, 'utf8');
  const original = content;

  for (const [localUrl, remoteUrl] of uploadedUrls) {
    content = content.split(localUrl).join(remoteUrl);
  }

  if (content !== original) {
    writeFileSync(path, content);
    console.log(`rewrote ${path}`);
  }
}
