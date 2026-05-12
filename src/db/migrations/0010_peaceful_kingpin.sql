ALTER TABLE "guest_generation"
  ALTER COLUMN "created_at" TYPE timestamp with time zone
  USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "guest_generation"
  ALTER COLUMN "updated_at" TYPE timestamp with time zone
  USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "guest_generation"
  ALTER COLUMN "completed_at" TYPE timestamp with time zone
  USING "completed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "home_idempotency"
  ALTER COLUMN "created_at" TYPE timestamp with time zone
  USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "home_idempotency"
  ALTER COLUMN "updated_at" TYPE timestamp with time zone
  USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "home_idempotency"
  ALTER COLUMN "expires_at" TYPE timestamp with time zone
  USING "expires_at" AT TIME ZONE 'UTC';
