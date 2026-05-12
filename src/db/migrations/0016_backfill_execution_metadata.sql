-- Backfill legacy `metadata.upstreamBackend` / `metadata.channelDecision`
-- into the new `execution_metadata` JSONB column for both `asset` and
-- `guest_generation` tables. After this migration, those internal-only
-- fields live in `execution_metadata` (not serialized to clients via
-- `toPublicAsset`), and `metadata` only holds public fields like
-- `creditDeduction` / `billingMode` / `refunded`.
--
-- Idempotent: if `execution_metadata` already holds the keys (because a
-- new write landed), we keep them; only fill in missing keys from
-- `metadata`. Then strip the internal keys from `metadata`.
--
-- Safe to re-run: each statement is a no-op on rows that have already
-- been migrated.

-- 1) asset: copy missing internal keys from metadata into execution_metadata
UPDATE "asset"
SET "execution_metadata" = COALESCE("execution_metadata", '{}'::jsonb)
  || jsonb_strip_nulls(jsonb_build_object(
       'upstreamBackend',
       CASE WHEN "execution_metadata" ? 'upstreamBackend'
            THEN "execution_metadata"->'upstreamBackend'
            ELSE "metadata"->'upstreamBackend' END,
       'channelDecision',
       CASE WHEN "execution_metadata" ? 'channelDecision'
            THEN "execution_metadata"->'channelDecision'
            ELSE "metadata"->'channelDecision' END
     ))
WHERE "metadata" IS NOT NULL
  AND ("metadata" ? 'upstreamBackend' OR "metadata" ? 'channelDecision');
--> statement-breakpoint

-- 2) asset: strip the now-migrated keys from public metadata
UPDATE "asset"
SET "metadata" = "metadata" - 'upstreamBackend' - 'channelDecision'
WHERE "metadata" IS NOT NULL
  AND ("metadata" ? 'upstreamBackend' OR "metadata" ? 'channelDecision');
--> statement-breakpoint

-- 3) guest_generation: same copy
UPDATE "guest_generation"
SET "execution_metadata" = COALESCE("execution_metadata", '{}'::jsonb)
  || jsonb_strip_nulls(jsonb_build_object(
       'upstreamBackend',
       CASE WHEN "execution_metadata" ? 'upstreamBackend'
            THEN "execution_metadata"->'upstreamBackend'
            ELSE "metadata"->'upstreamBackend' END,
       'channelDecision',
       CASE WHEN "execution_metadata" ? 'channelDecision'
            THEN "execution_metadata"->'channelDecision'
            ELSE "metadata"->'channelDecision' END
     ))
WHERE "metadata" IS NOT NULL
  AND ("metadata" ? 'upstreamBackend' OR "metadata" ? 'channelDecision');
--> statement-breakpoint

-- 4) guest_generation: same strip
UPDATE "guest_generation"
SET "metadata" = "metadata" - 'upstreamBackend' - 'channelDecision'
WHERE "metadata" IS NOT NULL
  AND ("metadata" ? 'upstreamBackend' OR "metadata" ? 'channelDecision');
