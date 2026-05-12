CREATE TABLE "rate_limit_counter" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_key" text NOT NULL,
	"intent" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_counter_subject_intent_window_unique_idx" ON "rate_limit_counter" USING btree ("subject_key","intent","window_start");--> statement-breakpoint
CREATE INDEX "rate_limit_counter_window_start_idx" ON "rate_limit_counter" USING btree ("window_start");