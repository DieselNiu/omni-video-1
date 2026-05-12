CREATE TABLE "guest_generation" (
	"id" text PRIMARY KEY NOT NULL,
	"guest_id" text NOT NULL,
	"user_id" text,
	"quota_bucket_id" text,
	"abuse_bind_key_snapshot" text,
	"type" text DEFAULT 'image' NOT NULL,
	"provider_request_id" text,
	"status" text NOT NULL,
	"title" text,
	"model_id" text,
	"prompt" text,
	"optimized_prompt" text,
	"negative_prompt" text,
	"channel" text,
	"mode" text,
	"output_format" text,
	"aspect_ratio" text,
	"resolution" text,
	"input_image_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"output_image_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"output_image_urls_r2" text[],
	"thumbnail_url" text,
	"error_message" text,
	"metadata" jsonb,
	"logs" jsonb,
	"metrics" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "home_idempotency" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_key" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_code" integer,
	"response_body" jsonb,
	"generation_kind" text,
	"generation_id" text,
	"provider_request_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota_bucket" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"ip_prefix_hash" text,
	"ua_hash" text,
	"locale" text,
	"visitor_id_risk_signal" text,
	"remaining" integer DEFAULT 5 NOT NULL,
	"capacity" integer DEFAULT 5 NOT NULL,
	"policy" text NOT NULL,
	"next_refill_at" timestamp,
	"exhausted_at" timestamp,
	"linked_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_guest_gen_guest_created_anon" ON "guest_generation" USING btree ("guest_id","created_at" DESC NULLS LAST) WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX "idx_guest_gen_user_created" ON "guest_generation" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_guest_gen_abuse_bind" ON "guest_generation" USING btree ("abuse_bind_key_snapshot");--> statement-breakpoint
CREATE INDEX "idx_guest_gen_quota_bucket" ON "guest_generation" USING btree ("quota_bucket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_generation_provider_request_id_unique_idx" ON "guest_generation" USING btree ("provider_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "home_idempotency_subject_key_unique_idx" ON "home_idempotency" USING btree ("subject_key","idempotency_key");--> statement-breakpoint
CREATE INDEX "home_idempotency_expires_idx" ON "home_idempotency" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quota_bucket_subject_unique_idx" ON "quota_bucket" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "idx_quota_linked_user" ON "quota_bucket" USING btree ("linked_user_id") WHERE linked_user_id IS NOT NULL;