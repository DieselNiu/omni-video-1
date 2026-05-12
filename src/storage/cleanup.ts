import { getDb } from '@/db';
import { asset, guestGeneration } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { deleteFile, listObjectsInFolder } from './index';
import { UPLOAD_INTENTS, type UploadIntent } from './intents';

const DEFAULT_TTL_HOURS = 24;
// Cap per intent per run so the first-drain after enabling cleanup
// (where legacy orphan count may reach tens of thousands) cannot
// exceed the reverse-proxy timeout. Subsequent daily runs will
// naturally have far fewer candidates.
const DEFAULT_MAX_LIST_PER_INTENT = 2000;
// Concurrency for the S3 delete loop. Sequential per-object deletes
// dominated total runtime; 10 parallel requests brings it into a
// band that fits under CF's 100s origin timeout on first run.
const DELETE_CONCURRENCY = 10;

function getMaxListPerIntent(): number {
  const raw = process.env.UPLOAD_CLEANUP_MAX_LIST_PER_INTENT;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_LIST_PER_INTENT;
}

export interface CleanupIntentResult {
  intent: UploadIntent;
  folder: string;
  listed: number;
  candidates: number;
  deleted: number;
  skipped: number;
  errors: number;
}

function getTtlHours(): number {
  const raw = process.env.UPLOAD_CLEANUP_TTL_HOURS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_HOURS;
}

const REFERENCE_LOOKUP_CHUNK = 500;

async function findReferencedUrls(
  candidateUrls: string[]
): Promise<Set<string>> {
  if (candidateUrls.length === 0) {
    return new Set();
  }

  const db = await getDb();
  const referenced = new Set<string>();

  // Chunk the candidates and run each chunk through a CTE. VALUES
  // keeps the comparison set server-side (one scalar parameter per
  // URL, no JS array serialization), which sidesteps the three
  // Drizzle/Postgres pitfalls we hit earlier: "op ANY/ALL requires
  // array on right side" (small sets), "malformed array literal"
  // (single element), and "ROW expressions can have at most 1664
  // entries" (large sets).
  for (let i = 0; i < candidateUrls.length; i += REFERENCE_LOOKUP_CHUNK) {
    const chunk = candidateUrls.slice(i, i + REFERENCE_LOOKUP_CHUNK);
    const valuesSql = sql.join(
      chunk.map((u) => sql`(${u})`),
      sql`, `
    );

    const assetRows = await db.execute<{ url: string }>(sql`
      WITH candidates(url) AS (VALUES ${valuesSql})
      SELECT c.url FROM candidates c
      WHERE EXISTS (
        SELECT 1 FROM ${asset} a WHERE c.url = ANY(a.input_image_urls)
      )
    `);
    for (const row of assetRows) {
      if (row.url) referenced.add(row.url);
    }

    const guestRows = await db.execute<{ url: string }>(sql`
      WITH candidates(url) AS (VALUES ${valuesSql})
      SELECT c.url FROM candidates c
      WHERE EXISTS (
        SELECT 1 FROM ${guestGeneration} g
        WHERE c.url = ANY(g.input_image_urls)
      )
    `);
    for (const row of guestRows) {
      if (row.url) referenced.add(row.url);
    }
  }

  return referenced;
}

function buildPublicUrl(key: string): string {
  const publicUrl = process.env.STORAGE_PUBLIC_URL?.replace(/\/$/, '') ?? '';
  const endpoint = process.env.STORAGE_ENDPOINT?.replace(/\/$/, '') ?? '';
  const base = publicUrl || endpoint;
  return base ? `${base}/${key}` : key;
}

async function cleanupIntent(
  intent: UploadIntent,
  now: Date
): Promise<CleanupIntentResult> {
  const config = UPLOAD_INTENTS[intent];
  const folder = config.folder;
  const result: CleanupIntentResult = {
    intent,
    folder,
    listed: 0,
    candidates: 0,
    deleted: 0,
    skipped: 0,
    errors: 0,
  };

  const ttlMs = getTtlHours() * 60 * 60 * 1000;
  const cutoff = now.getTime() - ttlMs;
  const maxList = getMaxListPerIntent();

  const listed = await listObjectsInFolder(`${folder}/`, maxList);
  result.listed = listed.length;
  console.log(`[upload-cleanup] ${intent}: listed=${listed.length}`);

  const candidates = listed.filter(
    (item) => item.lastModified.getTime() < cutoff
  );
  result.candidates = candidates.length;
  console.log(
    `[upload-cleanup] ${intent}: candidates=${candidates.length} (after ${getTtlHours()}h ttl)`
  );

  if (candidates.length === 0) {
    return result;
  }

  const candidateUrls = candidates.map((item) => buildPublicUrl(item.key));
  const referenced = await findReferencedUrls(candidateUrls);
  console.log(
    `[upload-cleanup] ${intent}: referenced=${referenced.size}, to-delete=${candidates.length - referenced.size}`
  );

  // Build the delete list up front, then fan out with bounded
  // concurrency. Each worker pulls the next index off a shared
  // counter until the list is exhausted.
  const toDelete: Array<{ key: string; url: string }> = [];
  for (let i = 0; i < candidates.length; i++) {
    const url = candidateUrls[i];
    if (referenced.has(url)) {
      result.skipped += 1;
      continue;
    }
    toDelete.push({ key: candidates[i].key, url });
  }

  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(DELETE_CONCURRENCY, toDelete.length) },
    async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= toDelete.length) return;
        const item = toDelete[idx];
        try {
          await deleteFile(item.key);
          result.deleted += 1;
        } catch (error) {
          result.errors += 1;
          console.error('[upload-cleanup] delete failed', {
            intent,
            key: item.key,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  );
  await Promise.all(workers);
  console.log(
    `[upload-cleanup] ${intent}: done deleted=${result.deleted} errors=${result.errors} skipped=${result.skipped}`
  );

  return result;
}

/**
 * Clean up orphaned uploads for all temporary-lifecycle intents.
 * Skips persistent intents (e.g. avatar) entirely.
 */
export async function cleanupTemporaryUploads(
  now: Date = new Date()
): Promise<CleanupIntentResult[]> {
  const results: CleanupIntentResult[] = [];

  for (const [name, config] of Object.entries(UPLOAD_INTENTS)) {
    if (config.lifecycle !== 'temporary') continue;
    try {
      const result = await cleanupIntent(name as UploadIntent, now);
      results.push(result);
    } catch (error) {
      console.error('[upload-cleanup] intent failed', {
        intent: name,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({
        intent: name as UploadIntent,
        folder: config.folder,
        listed: 0,
        candidates: 0,
        deleted: 0,
        skipped: 0,
        errors: 1,
      });
    }
  }

  return results;
}
