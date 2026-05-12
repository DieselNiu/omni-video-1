CREATE TABLE "asset" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"title" text,
	"prompt" text,
	"optimized_prompt" text,
	"negative_prompt" text,
	"model_id" text,
	"channel" text,
	"mode" text,
	"output_format" text,
	"aspect_ratio" text,
	"resolution" text,
	"duration_seconds" integer,
	"has_audio" boolean,
	"effect_id" text,
	"input_image_urls" text[],
	"input_image_roles" text[],
	"output_image_urls" text[],
	"output_image_urls_r2" text[],
	"output_video_url" text,
	"output_video_url_r2" text,
	"thumbnail_url" text,
	"provider_request_id" text,
	"error_message" text,
	"metadata" jsonb,
	"logs" jsonb,
	"metrics" jsonb,
	"credits_used" integer,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"is_delete" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_config" (
	"id" text PRIMARY KEY NOT NULL,
	"model_family" text NOT NULL,
	"model_type" text NOT NULL,
	"channel" text NOT NULL,
	"model_version" text,
	"api_model_id" text,
	"priority" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_checkin" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"checkin_date" text NOT NULL,
	"streak_day" integer NOT NULL,
	"reward_credits" integer NOT NULL,
	"cycle_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "effect_config" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"title" text NOT NULL,
	"page_title" text,
	"page_description" text,
	"preview_image" text,
	"preview_video" text,
	"preview_thumbnail" text,
	"preview_gif" text,
	"effect_type" text DEFAULT 'pixverse_template' NOT NULL,
	"pixverse_template_id" integer,
	"max_images" integer DEFAULT 1,
	"prompt_template" text,
	"parameters" text,
	"credits_required" integer DEFAULT 10,
	"category" text,
	"display_order" integer DEFAULT 0,
	"is_hot" boolean DEFAULT false,
	"status" text DEFAULT 'created' NOT NULL,
	"content" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_entitlement" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"scope" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_transaction" ADD COLUMN "asset_id" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "provider" text DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "paypal_subscription_id" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "paypal_order_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "device_fingerprint" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "admin_granted_pro" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "admin_granted_pro_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_checkin" ADD CONSTRAINT "daily_checkin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_entitlement" ADD CONSTRAINT "user_entitlement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_user_id_idx" ON "asset" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "asset_user_type_idx" ON "asset" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "asset_user_status_idx" ON "asset" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "asset_user_created_idx" ON "asset" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "asset_provider_request_id_idx" ON "asset" USING btree ("provider_request_id");--> statement-breakpoint
CREATE INDEX "asset_is_favorite_idx" ON "asset" USING btree ("user_id","is_favorite");--> statement-breakpoint
CREATE INDEX "channel_config_family_idx" ON "channel_config" USING btree ("model_family");--> statement-breakpoint
CREATE INDEX "channel_config_type_idx" ON "channel_config" USING btree ("model_type");--> statement-breakpoint
CREATE INDEX "channel_config_channel_idx" ON "channel_config" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "channel_config_composite_idx" ON "channel_config" USING btree ("model_family","model_type","channel","model_version");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_checkin_user_date_unique_idx" ON "daily_checkin" USING btree ("user_id","checkin_date");--> statement-breakpoint
CREATE INDEX "daily_checkin_user_id_idx" ON "daily_checkin" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "effect_config_slug_idx" ON "effect_config" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "effect_config_locale_idx" ON "effect_config" USING btree ("locale");--> statement-breakpoint
CREATE INDEX "effect_config_status_idx" ON "effect_config" USING btree ("status");--> statement-breakpoint
CREATE INDEX "effect_config_category_idx" ON "effect_config" USING btree ("category");--> statement-breakpoint
CREATE INDEX "user_entitlement_user_id_idx" ON "user_entitlement" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_entitlement_scope_idx" ON "user_entitlement" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "user_entitlement_status_idx" ON "user_entitlement" USING btree ("status");--> statement-breakpoint
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_transaction_asset_id_idx" ON "credit_transaction" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transaction_payment_id_unique_idx" ON "credit_transaction" USING btree ("payment_id") WHERE payment_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payment_provider_idx" ON "payment" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "payment_paypal_subscription_id_idx" ON "payment" USING btree ("paypal_subscription_id");--> statement-breakpoint
CREATE INDEX "payment_paypal_order_id_idx" ON "payment" USING btree ("paypal_order_id");--> statement-breakpoint
CREATE INDEX "user_device_fingerprint_idx" ON "user" USING btree ("device_fingerprint");