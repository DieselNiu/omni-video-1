ALTER TABLE "asset" ADD COLUMN "external_model_id" text;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "internal_model_id" text;--> statement-breakpoint
ALTER TABLE "guest_generation" ADD COLUMN "external_model_id" text;--> statement-breakpoint
ALTER TABLE "guest_generation" ADD COLUMN "internal_model_id" text;