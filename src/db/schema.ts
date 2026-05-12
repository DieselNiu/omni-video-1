import { boolean, integer, jsonb, pgTable, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull(),
	image: text('image'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	role: text('role'),
	banned: boolean('banned'),
	banReason: text('ban_reason'),
	banExpires: timestamp('ban_expires'),
	customerId: text('customer_id'),
	deviceFingerprint: text('device_fingerprint'),
	adminGrantedPro: boolean('admin_granted_pro').default(false),
	adminGrantedProExpiresAt: timestamp('admin_granted_pro_expires_at'),
}, (table) => ({
	userIdIdx: index("user_id_idx").on(table.id),
	userCustomerIdIdx: index("user_customer_id_idx").on(table.customerId),
	userRoleIdx: index("user_role_idx").on(table.role),
	userDeviceFingerprintIdx: index("user_device_fingerprint_idx").on(table.deviceFingerprint),
}));

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp('expires_at').notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	impersonatedBy: text('impersonated_by')
}, (table) => ({
	sessionTokenIdx: index("session_token_idx").on(table.token),
	sessionUserIdIdx: index("session_user_id_idx").on(table.userId),
}));

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at'),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull()
}, (table) => ({
	accountUserIdIdx: index("account_user_id_idx").on(table.userId),
	accountAccountIdIdx: index("account_account_id_idx").on(table.accountId),
	accountProviderIdIdx: index("account_provider_id_idx").on(table.providerId),
}));

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at'),
	updatedAt: timestamp('updated_at')
});

export const payment = pgTable("payment", {
	id: text("id").primaryKey(),
	priceId: text('price_id').notNull(),
	type: text('type').notNull(),
	scene: text('scene'), // payment scene: 'lifetime', 'credit', 'subscription'
	interval: text('interval'),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	customerId: text('customer_id').notNull(),
	subscriptionId: text('subscription_id'),
	sessionId: text('session_id'),
	invoiceId: text('invoice_id').unique(), // unique constraint for avoiding duplicate processing
	status: text('status').notNull(),
	paid: boolean('paid').notNull().default(false), // indicates whether payment is completed (set in invoice.paid event)
	periodStart: timestamp('period_start'),
	periodEnd: timestamp('period_end'),
	cancelAtPeriodEnd: boolean('cancel_at_period_end'),
	trialStart: timestamp('trial_start'),
	trialEnd: timestamp('trial_end'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
	// PayPal specific fields
	provider: text('provider').notNull().default('stripe'), // 'stripe' | 'paypal'
	paypalSubscriptionId: text('paypal_subscription_id'), // PayPal subscription ID
	paypalOrderId: text('paypal_order_id'), // PayPal order ID
}, (table) => ({
	paymentTypeIdx: index("payment_type_idx").on(table.type),
	paymentSceneIdx: index("payment_scene_idx").on(table.scene),
	paymentPriceIdIdx: index("payment_price_id_idx").on(table.priceId),
	paymentUserIdIdx: index("payment_user_id_idx").on(table.userId),
	paymentCustomerIdIdx: index("payment_customer_id_idx").on(table.customerId),
	paymentStatusIdx: index("payment_status_idx").on(table.status),
	paymentPaidIdx: index("payment_paid_idx").on(table.paid),
	paymentSubscriptionIdIdx: index("payment_subscription_id_idx").on(table.subscriptionId),
	paymentSessionIdIdx: index("payment_session_id_idx").on(table.sessionId),
	paymentInvoiceIdIdx: index("payment_invoice_id_idx").on(table.invoiceId),
	paymentProviderIdx: index("payment_provider_idx").on(table.provider),
	paymentPaypalSubscriptionIdIdx: index("payment_paypal_subscription_id_idx").on(table.paypalSubscriptionId),
	paymentPaypalOrderIdIdx: index("payment_paypal_order_id_idx").on(table.paypalOrderId),
}));

export const userCredit = pgTable("user_credit", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
	currentCredits: integer("current_credits").notNull().default(0),
	lastRefreshAt: timestamp("last_refresh_at"), // deprecated
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
	userCreditUserIdIdx: index("user_credit_user_id_idx").on(table.userId),
}));

// Unified assets for images, videos, and future media types
export const asset = pgTable("asset", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
	type: text("type").notNull(), // image | video | audio | other
	status: text("status").notNull(),

	// Content fields
	title: text("title"),
	prompt: text("prompt"),
	optimizedPrompt: text("optimized_prompt"),
	negativePrompt: text("negative_prompt"),

	// Model and generation parameters
	modelId: text("model_id"),
	// Phase 1 registry migration: dual-write columns. externalModelId = ProductModel.id
	// (user-facing), internalModelId = ExecutableModel.id (what the provider dispatch
	// actually runs). Legacy modelId column stays authoritative for reads until Phase 4.
	externalModelId: text("external_model_id"),
	internalModelId: text("internal_model_id"),
	channel: text("channel"), // actual channel used for generation (e.g., 'kie', 'flow', 'ali', 'byteplus', 'jimeng')
	mode: text("mode"), // text-to-image, image-to-image, text-to-video, image-to-video
	outputFormat: text("output_format"),
	aspectRatio: text("aspect_ratio"),
	resolution: text("resolution"),
	durationSeconds: integer("duration_seconds"),
	hasAudio: boolean("has_audio"),
	effectId: text("effect_id"),

	// Input
	inputImageUrls: text("input_image_urls").array(),
	inputImageRoles: text("input_image_roles").array(),

	// Output - Image
	outputImageUrls: text("output_image_urls").array(),
	outputImageUrlsR2: text("output_image_urls_r2").array(),

	// Output - Video
	outputVideoUrl: text("output_video_url"),
	outputVideoUrlR2: text("output_video_url_r2"),

	// Thumbnail
	thumbnailUrl: text("thumbnail_url"),

	// Provider tracking
	providerRequestId: text("provider_request_id"),
	errorMessage: text("error_message"),

	// Metadata (JSONB)
	// `metadata`: ProductModel-level fields safe to surface to the client
	// (creditDeduction, billingMode, refund flags, etc.).
	// `executionMetadata`: ExecutableModel-level internal fields that
	// MUST NOT leak (upstreamBackend, channelDecision, provider names).
	// API serializers (toPublicAsset) strip both metadata and
	// executionMetadata; the split makes the intent explicit at write
	// time so callers don't accidentally mix internal data into the
	// public bag.
	metadata: jsonb("metadata"),
	executionMetadata: jsonb("execution_metadata"),
	logs: jsonb("logs"),
	metrics: jsonb("metrics"),

	// Credits
	creditsUsed: integer("credits_used"),

	// Source of generation: 'web' (dashboard/UI) or 'api' (public /api/v1). Null = legacy rows, treated as 'web'.
	source: text("source"),

	// Flags
	isFavorite: boolean("is_favorite").notNull().default(false),
	isDelete: boolean("is_delete").default(false),

	// Timestamps
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
	assetUserIdIdx: index("asset_user_id_idx").on(table.userId),
	assetUserTypeIdx: index("asset_user_type_idx").on(table.userId, table.type),
	assetUserStatusIdx: index("asset_user_status_idx").on(table.userId, table.status),
	assetUserCreatedIdx: index("asset_user_created_idx").on(table.userId, table.createdAt),
	assetProviderRequestIdIdx: index("asset_provider_request_id_idx").on(table.providerRequestId),
	assetIsFavoriteIdx: index("asset_is_favorite_idx").on(table.userId, table.isFavorite),
}));

export const guestGeneration = pgTable("guest_generation", {
	id: text("id").primaryKey(),
	guestId: text("guest_id").notNull(),
	userId: text("user_id"),
	quotaBucketId: text("quota_bucket_id"),
	abuseBindKeySnapshot: text("abuse_bind_key_snapshot"),
	type: text("type").notNull().default("image"),
	providerRequestId: text("provider_request_id"),
	status: text("status").notNull(),
	title: text("title"),
	modelId: text("model_id"),
	// Phase 1 registry migration: dual-write columns. See asset table for rationale.
	externalModelId: text("external_model_id"),
	internalModelId: text("internal_model_id"),
	prompt: text("prompt"),
	optimizedPrompt: text("optimized_prompt"),
	negativePrompt: text("negative_prompt"),
	channel: text("channel"),
	mode: text("mode"),
	outputFormat: text("output_format"),
	aspectRatio: text("aspect_ratio"),
	resolution: text("resolution"),
	inputImageUrls: text("input_image_urls").array().notNull().default(sql`'{}'::text[]`),
	outputImageUrls: text("output_image_urls").array().notNull().default(sql`'{}'::text[]`),
	outputImageUrlsR2: text("output_image_urls_r2").array(),
	thumbnailUrl: text("thumbnail_url"),
	errorMessage: text("error_message"),
	// See asset.metadata / asset.executionMetadata for the public/internal
	// split rationale. Same semantics here.
	metadata: jsonb("metadata"),
	executionMetadata: jsonb("execution_metadata"),
	logs: jsonb("logs"),
	metrics: jsonb("metrics"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
	guestGenerationGuestCreatedAnonIdx: index("idx_guest_gen_guest_created_anon")
		.on(table.guestId, table.createdAt.desc())
		.where(sql`user_id IS NULL`),
	guestGenerationUserCreatedIdx: index("idx_guest_gen_user_created").on(
		table.userId,
		table.createdAt.desc()
	),
	guestGenerationAbuseBindIdx: index("idx_guest_gen_abuse_bind").on(
		table.abuseBindKeySnapshot
	),
	guestGenerationQuotaBucketIdx: index("idx_guest_gen_quota_bucket").on(
		table.quotaBucketId
	),
	guestGenerationProviderRequestUniqueIdx: uniqueIndex(
		"guest_generation_provider_request_id_unique_idx"
	).on(table.providerRequestId),
}));

export const quotaBucket = pgTable("quota_bucket", {
	id: text("id").primaryKey(),
	subjectType: text("subject_type").notNull(),
	subjectId: text("subject_id").notNull(),
	ipPrefixHash: text("ip_prefix_hash"),
	uaHash: text("ua_hash"),
	locale: text("locale"),
	visitorIdRiskSignal: text("visitor_id_risk_signal"),
	remaining: integer("remaining").notNull().default(5),
	capacity: integer("capacity").notNull().default(5),
	policy: text("policy").notNull(),
	nextRefillAt: timestamp("next_refill_at", { withTimezone: true }),
	exhaustedAt: timestamp("exhausted_at", { withTimezone: true }),
	linkedUserId: text("linked_user_id"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
	quotaBucketSubjectUniqueIdx: uniqueIndex("quota_bucket_subject_unique_idx").on(
		table.subjectType,
		table.subjectId
	),
	quotaBucketLinkedUserIdx: index("idx_quota_linked_user")
		.on(table.linkedUserId)
		.where(sql`linked_user_id IS NOT NULL`),
	quotaBucketVisitorIdIdx: index("idx_quota_visitor_id")
		.on(table.visitorIdRiskSignal)
		.where(sql`visitor_id_risk_signal IS NOT NULL`),
}));

export const homeIdempotency = pgTable("home_idempotency", {
	id: text("id").primaryKey(),
	subjectKey: text("subject_key").notNull(),
	idempotencyKey: text("idempotency_key").notNull(),
	status: text("status").notNull(),
	requestHash: text("request_hash").notNull(),
	responseCode: integer("response_code"),
	responseBody: jsonb("response_body"),
	generationKind: text("generation_kind"),
	generationId: text("generation_id"),
	providerRequestId: text("provider_request_id"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => ({
	homeIdempotencySubjectKeyUniqueIdx: uniqueIndex(
		"home_idempotency_subject_key_unique_idx"
	).on(table.subjectKey, table.idempotencyKey),
	homeIdempotencyExpiresIdx: index("home_idempotency_expires_idx").on(
		table.expiresAt
	),
}));

export const rateLimitCounter = pgTable("rate_limit_counter", {
	id: text("id").primaryKey(),
	subjectKey: text("subject_key").notNull(),
	intent: text("intent").notNull(),
	windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
	count: integer("count").notNull().default(0),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
	rateLimitCounterUniqueIdx: uniqueIndex(
		"rate_limit_counter_subject_intent_window_unique_idx"
	).on(table.subjectKey, table.intent, table.windowStart),
	rateLimitCounterWindowStartIdx: index("rate_limit_counter_window_start_idx").on(
		table.windowStart
	),
}));

export const creditTransaction = pgTable("credit_transaction", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
	type: text("type").notNull(),
	description: text("description"),
	amount: integer("amount").notNull(),
	remainingAmount: integer("remaining_amount"),
	paymentId: text("payment_id"), // idempotency key: checkout session ID for payments
	assetId: text("asset_id").references(() => asset.id, { onDelete: 'set null' }),
	expirationDate: timestamp("expiration_date"),
	expirationDateProcessedAt: timestamp("expiration_date_processed_at"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
	creditTransactionUserIdIdx: index("credit_transaction_user_id_idx").on(table.userId),
	creditTransactionTypeIdx: index("credit_transaction_type_idx").on(table.type),
	creditTransactionAssetIdIdx: index("credit_transaction_asset_id_idx").on(table.assetId),
	creditTransactionPaymentIdUniqueIdx: uniqueIndex("credit_transaction_payment_id_unique_idx").on(table.paymentId).where(sql`payment_id IS NOT NULL`),
}));

export const dailyCheckin = pgTable("daily_checkin", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
	checkinDate: text("checkin_date").notNull(),
	streakDay: integer("streak_day").notNull(),
	rewardCredits: integer("reward_credits").notNull(),
	cycleId: text("cycle_id"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
	dailyCheckinUserDateUniqueIdx: uniqueIndex("daily_checkin_user_date_unique_idx").on(table.userId, table.checkinDate),
	dailyCheckinUserIdIdx: index("daily_checkin_user_id_idx").on(table.userId),
}));

export const userEntitlement = pgTable("user_entitlement", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
	type: text("type").notNull(),
	scope: text("scope").notNull(),
	status: text("status").notNull().default("active"),
	source: text("source").notNull(),
	startsAt: timestamp("starts_at").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	metadata: jsonb("metadata"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
	userEntitlementUserIdIdx: index("user_entitlement_user_id_idx").on(table.userId),
	userEntitlementScopeIdx: index("user_entitlement_scope_idx").on(table.scope),
	userEntitlementStatusIdx: index("user_entitlement_status_idx").on(table.status),
}));

// Effect configuration for video effects (PixVerse templates, etc.)
export const effectConfig = pgTable("effect_config", {
	id: text("id").primaryKey(),
	slug: text("slug").notNull(),
	locale: text("locale").notNull().default("en"),
	title: text("title").notNull(),
	pageTitle: text("page_title"),
	pageDescription: text("page_description"),

	// Preview assets
	previewImage: text("preview_image"),
	previewVideo: text("preview_video"),
	previewThumbnail: text("preview_thumbnail"),
	previewGif: text("preview_gif"),

	// Effect configuration
	effectType: text("effect_type").notNull().default("pixverse_template"), // pixverse_template, hailuo_prompt
	pixverseTemplateId: integer("pixverse_template_id"),
	maxImages: integer("max_images").default(1),
	promptTemplate: text("prompt_template"),
	parameters: text("parameters"), // JSON string for additional parameters

	// Pricing
	creditsRequired: integer("credits_required").default(10),

	// Display
	category: text("category"),
	displayOrder: integer("display_order").default(0),
	isHot: boolean("is_hot").default(false),
	status: text("status").notNull().default("created"), // created, online, offline, deleted

	// Content (JSON for SEO, tips, FAQ, etc.)
	content: text("content"),

	// Timestamps
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
	effectConfigSlugIdx: index("effect_config_slug_idx").on(table.slug),
	effectConfigLocaleIdx: index("effect_config_locale_idx").on(table.locale),
	effectConfigStatusIdx: index("effect_config_status_idx").on(table.status),
	effectConfigCategoryIdx: index("effect_config_category_idx").on(table.category),
}));

// Channel configuration for multi-provider routing
export const channelConfig = pgTable("channel_config", {
	id: text("id").primaryKey(),
	modelFamily: text("model_family").notNull(), // veo3, nano-banana, sora2, seedance
	modelType: text("model_type").notNull(), // text-to-video, image-to-video, text-to-image
	channel: text("channel").notNull(), // kie, apicore, google, byteplus, volcano, jimeng
	modelVersion: text("model_version"), // nullable, e.g. '2.0', '1.5'
	apiModelId: text("api_model_id"), // nullable, override the actual API model ID sent to the provider
	priority: integer("priority").notNull().default(1),
	enabled: boolean("enabled").notNull().default(true),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
	channelConfigFamilyIdx: index("channel_config_family_idx").on(table.modelFamily),
	channelConfigTypeIdx: index("channel_config_type_idx").on(table.modelType),
	channelConfigChannelIdx: index("channel_config_channel_idx").on(table.channel),
	channelConfigCompositeIdx: index("channel_config_composite_idx").on(table.modelFamily, table.modelType, table.channel, table.modelVersion),
}));

export const apiKey = pgTable("api_key", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
	name: text("name").notNull(),
	// sha256(plaintextKey), hex. Plaintext is shown once on creation and never stored.
	keyHash: text("key_hash").notNull(),
	// Leading portion of the plaintext (e.g. first 12 chars) for list display & lookup.
	keyPrefix: text("key_prefix").notNull(),
	lastUsedAt: timestamp("last_used_at"),
	revokedAt: timestamp("revoked_at"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
	apiKeyUserIdIdx: index("api_key_user_id_idx").on(table.userId),
	apiKeyPrefixIdx: index("api_key_prefix_idx").on(table.keyPrefix),
	apiKeyHashUniqueIdx: uniqueIndex("api_key_hash_unique_idx").on(table.keyHash),
}));

export const apiUsageLog = pgTable("api_usage_log", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
	apiKeyId: text("api_key_id").references(() => apiKey.id, { onDelete: 'set null' }),
	// 'submit' | 'query'
	endpoint: text("endpoint").notNull(),
	// Reference to asset.id when applicable
	taskId: text("task_id"),
	// 'success' | 'failed' | 'insufficient_credits' | 'provider_error' | 'unauthorized' | 'not_found'
	status: text("status").notNull(),
	// Credits consumed for this call (positive = spent, negative = refunded, 0 = free/query)
	creditsDelta: integer("credits_delta").notNull().default(0),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
	apiUsageLogUserIdIdx: index("api_usage_log_user_id_idx").on(table.userId),
	apiUsageLogUserCreatedIdx: index("api_usage_log_user_created_idx").on(table.userId, table.createdAt),
	apiUsageLogApiKeyIdIdx: index("api_usage_log_api_key_id_idx").on(table.apiKeyId),
}));
