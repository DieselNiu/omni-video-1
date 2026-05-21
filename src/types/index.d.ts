import type { ReactNode } from 'react';
import type { PricePlan } from '@/payment/types';
import type { CreditPackage } from '@/credits/types';

/**
 * website config, without translations
 */
export type WebsiteConfig = {
  siteType: 'video' | 'image';
  ui: UiConfig;
  metadata: MetadataConfig;
  features: FeaturesConfig;
  routes: RoutesConfig;
  analytics: AnalyticsConfig;
  auth: AuthConfig;
  i18n: I18nConfig;
  blog: BlogConfig;
  docs: DocsConfig;
  mail: MailConfig;
  newsletter: NewsletterConfig;
  storage: StorageConfig;
  payment: PaymentConfig;
  price: PriceConfig;
  credits: CreditsConfig;
  generation: GenerationConfig;
  useCases: UseCasesConfig;
};

/**
 * UseCases section (homepage gallery) display config.
 * `displayModel` overrides the per-item model label inside the detail modal,
 * so the demo gallery can be reused across templates without leaking the
 * upstream model names baked into the demo dataset.
 */
export type UseCasesConfig = {
  displayModel: string;
};

/**
 * Surface = "where the generation is initiated from".
 * - `home-anonymous`: the public homepage, callers may be unauthenticated
 *   and lean on free-quota / tryout mode. Anti-abuse-sensitive.
 * - `user-paid`: any authenticated, credit-charged context (dashboard,
 *   /api/v1, etc.).
 *
 * Each surface has an explicit allow-list of ProductModel ids. The
 * submit routes reject any request whose model id is not in the list,
 * which makes "video model unavailable to anonymous users" / "Grok only
 * for the homepage giveaway" config-driven instead of scattered ifs.
 *
 * `defaultModel` is the model assigned when the client does not pass
 * one explicitly. Whether the front-end actually offers a picker is a
 * UI concern owned by the React components, not by config.
 */
export interface GenerationConfig {
  /** Image-modality surfaces. `allowedModels` references
   *  ProductModel ids in `IMAGE_PRODUCTS`; `executionRules`
   *  references `ImageExecutableModel` ids. Validated at boot. */
  surfaces: {
    'home-anonymous': SurfaceConfig;
    'user-paid': SurfaceConfig;
    /** Public bearer-token API (`/api/v1/images`). Programmatic clients,
     *  no UI / no free-quota — every call charges credits. Anti-abuse
     *  comes from the rate limiter, not surface gating, so this list
     *  can be wider than `home-anonymous` but should still avoid
     *  premium models that aren't safe for unattended automation. */
    api: SurfaceConfig;
  };
  /** Video-modality surfaces. `allowedModels` references the
   *  frontend-facing video model ids (keys of FRONTEND_MODEL_MAPPING
   *  in src/video/config/video-models.ts) — video does not yet have
   *  the ProductModel/ExecutableModel split that image uses, so
   *  `executionRules` are typically empty for video today. */
  videoSurfaces: {
    'user-paid': SurfaceConfig;
    api: SurfaceConfig;
  };
}

export interface SurfaceConfig {
  /** Whitelist of ProductModel ids permitted on this surface. */
  allowedModels: string[];
  /** Model the surface uses when the request omits an explicit
   *  model id. MUST be in `allowedModels`. */
  defaultModel: string;
  /**
   * Server-side executable routing — invisible to the client.
   *
   * The user-facing `modelId` (a ProductModel id like `gpt-image-2`)
   * stays unchanged on the wire; these rules pick which
   * ExecutableModel actually runs. Use to send Chinese-locale traffic
   * to a cheaper Grok backend, route by country for cost/legal
   * reasons, etc.
   *
   * Rules are evaluated top-to-bottom; the first match wins. If none
   * match, `executionFallbackId` is used (or the ProductModel's own
   * `resolver.fallbackExecutableId` when this field is omitted).
   *
   * Optional — surfaces that don't need conditional routing can omit
   * both fields and the registry's product-level resolver runs as
   * before.
   */
  executionRules?: ExecutionRule[];
  /** ExecutableModel id used when no rule matches. Optional — falls
   *  back to the ProductModel's `resolver.fallbackExecutableId`. */
  executionFallbackId?: string;
}

/**
 * Single conditional execution-routing rule.
 *
 * Match dimensions are ANDed within a rule. Multi-value fields (e.g.
 * `country`) match if the request's value is in the array.
 *
 * Add new dimensions only when there's a real product need; each new
 * field expands the surface area config authors must reason about.
 */
export interface ExecutionRule {
  when: {
    /** Country code from CDN/edge headers (e.g. CF-IPCountry). */
    country?: string[];
    /** First language tag from `accept-language` (e.g. 'zh', 'en'). */
    locale?: string[];
    /** True when the prompt is detected as predominantly Chinese
     *  characters (anti-abuse signal independent of IP/locale). */
    promptIsChinese?: boolean;
  };
  executableId: string;
}

/**
 * UI configuration
 */
export interface UiConfig {
  mode?: ModeConfig;
  theme?: ThemeConfig;
  enableAuthButtons?: boolean;  // Whether to enable the auth buttons (login/sign up) in the navbar
}

/**
 * Website metadata
 */
export interface MetadataConfig {
  images?: ImagesConfig;
  social?: SocialConfig;
}

export interface ModeConfig {
  defaultMode?: 'light' | 'dark' | 'system';                  // The default mode of the website
  enableSwitch?: boolean;                                     // Whether to enable the mode switch
}

export interface ThemeConfig {
  defaultTheme?: 'default' | 'blue' | 'green' | 'amber' | 'neutral'; // The default theme of the website
  enableSwitch?: boolean;                                     // Whether to enable the theme switch
}

export interface ImagesConfig {
  ogImage?: string;                                           // The image as Open Graph image
  logoLight?: string;                                         // The light logo image
  logoDark?: string;                                          // The dark logo image
}

/**
 * Social media configuration
 */
export interface SocialConfig {
  twitter?: string;
  github?: string;
  discord?: string;
  blueSky?: string;
  mastodon?: string;
  youtube?: string;
  linkedin?: string;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  telegram?: string;
}

/**
 * Website features
 */
export interface FeaturesConfig {
  enableCrispChat?: boolean;          // Whether to enable the crisp chat
  enableUpgradeCard?: boolean;        // Whether to enable the upgrade card in the sidebar
  enableUpdateAvatar?: boolean;       // Whether to enable the update avatar in settings
  enableAffonsoAffiliate?: boolean;   // Whether to enable affonso affiliate
  enablePromotekitAffiliate?: boolean;   // Whether to enable promotekit affiliate
  enableDatafastRevenueTrack?: boolean;   // Whether to enable datafast revenue tracking
  enableTurnstileCaptcha?: boolean;   // Whether to enable turnstile captcha
  enableNsfwDetection?: boolean;      // Whether to enable NSFW content detection
  enableWatermark?: boolean;          // Whether to enable watermark on free-tier generated images
  enableDailyCheckin?: boolean;       // Whether to enable daily check-in rewards
  enableDeviceFingerprint?: boolean;  // Whether to enable device fingerprint anti-abuse
  enableNotifications?: boolean;      // Whether to enable Discord/Feishu payment notifications
  enablePromptOptimization?: boolean; // Whether to enable AI prompt optimization for generation
  enableVideoEffects?: boolean;       // Whether to enable video effects (PixVerse)
}

/**
 * Routes configuration
 */
export interface RoutesConfig {
  defaultLoginRedirect?: string;      // The default login redirect route
}

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
  enableVercelAnalytics?: boolean;    // Whether to enable vercel analytics
  enableSpeedInsights?: boolean;      // Whether to enable speed insights
}

export interface AuthConfig {
  enableGoogleLogin?: boolean;       // Whether to enable google login
  enableGithubLogin?: boolean;       // Whether to enable github login
  enableYandexLogin?: boolean;       // Whether to enable yandex login (Russian users)
  enableCredentialLogin?: boolean;   // Whether to enable email/password login
  enableGoogleOneTap?: boolean;      // Whether to enable Google One Tap login
}

/**
 * I18n configuration
 *
 * hreflang: Hreflang value for SEO (e.g., 'en', 'zh-CN')
 * https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes
 * https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2
 */
export interface I18nConfig {
  defaultLocale: string;              // The default locale of the website
  locales: Record<string, {
    flag?: string;                    // The flag of the locale, leave empty if you don't want to display the flag
    name: string;                     // The name of the locale
    hreflang?: string;                // Hreflang value for SEO (e.g., 'en', 'zh-CN')
  }>;
}

/**
 * Blog configuration
 */
export interface BlogConfig {
  enable: boolean;                   // Whether to enable the blog
  paginationSize: number;            // Number of posts per page
  relatedPostsSize: number;          // Number of related posts to show
}

/**
 * Docs configuration
 */
export interface DocsConfig {
  enable: boolean;                   // Whether to enable the docs
}

/**
 * Mail configuration
 */
export interface MailConfig {
  provider: 'resend';                // The email provider, only resend is supported for now
  fromEmail?: string;                // The email address to send from
  supportEmail?: string;             // The email address to send support emails to
}

/**
 * Newsletter configuration
 */
export interface NewsletterConfig {
  enable: boolean;                   // Whether to enable the newsletter
  provider: 'resend';                 // The newsletter provider, only resend is supported for now
  autoSubscribeAfterSignUp?: boolean; // Whether to automatically subscribe users to the newsletter after sign up
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  enable: boolean;                   // Whether to enable the storage
  provider: 's3';                    // The storage provider, only s3 is supported for now
}

/**
 * Payment configuration
 */
export interface PaymentConfig {
  provider: 'stripe';                // The payment provider, only stripe is supported for now
  enablePaypal?: boolean;            // Whether to enable PayPal as additional payment method
}

/**
 * Price configuration
 */
export interface PriceConfig {
  plans: Record<string, PricePlan>;  // Plans indexed by ID
}

/**
 * Credits configuration
 */
export interface CreditsConfig {
  enableCredits: boolean;            // Whether to enable credits
  enablePackagesForFreePlan: boolean;// Whether to enable purchase credits for free plan users
  registerGiftCredits: {
    enable: boolean;                 // Whether to enable register gift credits
    amount: number;                  // The amount of credits to give to the user
    expireDays?: number;             // The number of days to expire the credits, undefined means no expire
  };
  packages: Record<string, CreditPackage>;  // Packages indexed by ID
  mode: 'tryout' | 'classic';        // 'tryout': guest+user free quota; 'classic': login + credits only
  guestFreeRequests: number;         // tryout: guest free generation count; ignored in classic
  userFreeRequests: number;          // tryout: logged-in user free quota capacity; ignored in classic
  userRefillMinutes: number;         // tryout: cooldown minutes to refill user free quota; ignored in classic
  guestCaptchaThreshold: number;     // tryout: captcha required when remaining <= N for normal guests; ignored in classic
  guestCaptchaThresholdAnomalous: number; // tryout: captcha threshold for anomalous guests (bucket-rotation suspects); ignored in classic
}

/**
 * menu item, used for navbar links, sidebar links, footer links
 */
export type MenuItem = {
  title: string;                      // The text to display
  description?: string;               // The description of the item
  icon?: ReactNode;                   // The icon to display
  href?: string;                      // The url to link to
  external?: boolean;                 // Whether the link is external
  authorizeOnly?: string[];           // The roles that are authorized to see the item
};

/**
 * nested menu item, used for navbar links, sidebar links, footer links
 */
export type NestedMenuItem = MenuItem & {
  items?: MenuItem[];                // The items to display in the nested menu
};

/**
 * Blog Category
 *
 * we can not pass CategoryType from server component to client component
 * so we need to define a new type, and use it in the client component
 */
export type BlogCategory = {
  slug: string;
  name: string;
  description: string;
};
