ALTER TABLE "quota_bucket"
  ALTER COLUMN "next_refill_at" TYPE timestamp with time zone
  USING "next_refill_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "quota_bucket"
  ALTER COLUMN "exhausted_at" TYPE timestamp with time zone
  USING "exhausted_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "quota_bucket"
  ALTER COLUMN "created_at" TYPE timestamp with time zone
  USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "quota_bucket"
  ALTER COLUMN "updated_at" TYPE timestamp with time zone
  USING "updated_at" AT TIME ZONE 'UTC';
