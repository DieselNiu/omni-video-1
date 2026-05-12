import { PaymentTypes, PlanIntervals } from '@/payment/types';
import type { WebsiteConfig } from '@/types';

/**
 * website config, without translations
 *
 * docs:
 * https://mksaas.com/docs/config/website
 */
export const websiteConfig: WebsiteConfig = {
  siteType: 'video', // 'video' = homepage uses VideoHeroSection, 'image' = homepage uses ImageHeroSection
  useCases: {
    displayModel: 'Gemini Omni',
  },
  ui: {
    theme: {
      defaultTheme: 'default',
      enableSwitch: false,
    },
    mode: {
      defaultMode: 'light',
      enableSwitch: false,
    },
    enableAuthButtons: true, // Set to false to hide login/sign up buttons
  },
  metadata: {
    images: {
      ogImage: '/og.png',
      logoLight: '/logo.png',
      logoDark: '/logo.png',
    },
    social: {
      github: 'https://github.com/MkSaaSHQ',
      twitter: 'https://mksaas.link/twitter',
      blueSky: 'https://mksaas.link/bsky',
      discord: 'https://mksaas.link/discord',
      mastodon: 'https://mksaas.link/mastodon',
      linkedin: 'https://mksaas.link/linkedin',
      youtube: 'https://mksaas.link/youtube',
    },
  },
  features: {
    enableUpgradeCard: false,
    enableUpdateAvatar: false,
    enableAffonsoAffiliate: false,
    enablePromotekitAffiliate: false,
    enableDatafastRevenueTrack: false,
    enableCrispChat: process.env.NEXT_PUBLIC_DEMO_WEBSITE === 'true',
    enableTurnstileCaptcha:
      process.env.NEXT_PUBLIC_ENABLE_TURNSTILE_CAPTCHA === 'true',
    enableNsfwDetection: false,
    enableWatermark: true,
    enableDailyCheckin: false,
    enableDeviceFingerprint: false,
    enableNotifications: false,
    enablePromptOptimization: false,
    enableVideoEffects: false,
  },
  routes: {
    defaultLoginRedirect: '/',
  },
  analytics: {
    enableVercelAnalytics: false,
    enableSpeedInsights: false,
  },
  auth: {
    enableGoogleLogin: true,
    enableGithubLogin: false,
    enableCredentialLogin: false,
    enableGoogleOneTap: true,
  },
  i18n: {
    defaultLocale: 'en',
    locales: {
      en: {
        flag: '🇺🇸',
        name: 'English',
        hreflang: 'en',
      },
    },
  },
  blog: {
    enable: false,
    paginationSize: 6,
    relatedPostsSize: 3,
  },
  docs: {
    enable: false,
  },
  mail: {
    provider: 'resend',
    fromEmail: 'Gemini Omni <hello@geminiomni.video>',
    supportEmail: 'Gemini Omni <hello@geminiomni.video>',
  },
  newsletter: {
    enable: false,
    provider: 'resend',
    autoSubscribeAfterSignUp: false,
  },
  storage: {
    enable: true,
    provider: 's3',
  },
  payment: {
    provider: 'stripe',
    enablePaypal: true,
  },
  price: {
    plans: {
      free: {
        id: 'free',
        prices: [],
        isFree: true,
        isLifetime: false,
        credits: {
          enable: false,
          amount: 0,
          expireDays: 30,
        },
      },
      lite: {
        id: 'lite',
        prices: [
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_LITE_MONTHLY!,
            amount: 2990,
            originalAmount: 3990, // strikethrough $39.9
            currency: 'USD',
            interval: PlanIntervals.MONTH,
            // Monthly Lite gets a richer credit allotment than the yearly default
            credits: {
              enable: true,
              amount: 600,
              expireDays: 30,
            },
          },
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_LITE_YEARLY!,
            amount: 11880,
            originalAmount: 35880, // $29.9/mo * 12 = $358.8/year, shows $29.9 strikethrough
            currency: 'USD',
            interval: PlanIntervals.YEAR,
          },
        ],
        isFree: false,
        isLifetime: false,
        popular: false,
        credits: {
          enable: true,
          amount: 200,
          expireDays: 30,
        },
      },
      pro: {
        id: 'pro',
        prices: [],
        isFree: false,
        isLifetime: false,
        popular: false,
        tiers: [
          {
            id: 'tier1',
            prices: [
              {
                type: PaymentTypes.SUBSCRIPTION,
                priceId:
                  process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER1_MONTHLY!,
                amount: 3500, // $35/mo
                originalAmount: 4900, // strikethrough $49
                currency: 'USD',
                interval: PlanIntervals.MONTH,
              },
              {
                type: PaymentTypes.SUBSCRIPTION,
                priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER1_YEARLY!,
                amount: 30000, // $300/year = $25/mo
                originalAmount: 42000, // $35/mo * 12 = $420, shows $35 strikethrough
                currency: 'USD',
                interval: PlanIntervals.YEAR,
              },
            ],
            credits: {
              enable: true,
              amount: 1000,
              expireDays: 30,
            },
          },
          {
            id: 'tier2',
            prices: [
              {
                type: PaymentTypes.SUBSCRIPTION,
                priceId:
                  process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER2_MONTHLY!,
                amount: 6900, // $69/mo
                originalAmount: 9900, // strikethrough $99
                currency: 'USD',
                interval: PlanIntervals.MONTH,
              },
              {
                type: PaymentTypes.SUBSCRIPTION,
                priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER2_YEARLY!,
                amount: 58800, // $588/year = $49/mo
                originalAmount: 82800, // $69/mo * 12 = $828, shows $69 strikethrough
                currency: 'USD',
                interval: PlanIntervals.YEAR,
              },
            ],
            credits: {
              enable: true,
              amount: 2400,
              expireDays: 30,
            },
          },
          {
            id: 'tier3',
            prices: [
              {
                type: PaymentTypes.SUBSCRIPTION,
                priceId:
                  process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER3_MONTHLY!,
                amount: 9700, // $97/mo
                originalAmount: 13900, // strikethrough $139
                currency: 'USD',
                interval: PlanIntervals.MONTH,
              },
              {
                type: PaymentTypes.SUBSCRIPTION,
                priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER3_YEARLY!,
                amount: 82800, // $828/year = $69/mo
                originalAmount: 116400, // $97/mo * 12 = $1164, shows $97 strikethrough
                currency: 'USD',
                interval: PlanIntervals.YEAR,
              },
            ],
            credits: {
              enable: true,
              amount: 3400,
              expireDays: 30,
            },
          },
        ],
      },
      premium: {
        id: 'premium',
        prices: [
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY || '',
            amount: 15900,
            originalAmount: 22900, // strikethrough $229
            currency: 'USD',
            interval: PlanIntervals.MONTH,
          },
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_YEARLY || '',
            amount: 142800,
            originalAmount: 190800, // $159/mo * 12 = $1908/year, shows $159 strikethrough (25% off)
            currency: 'USD',
            interval: PlanIntervals.YEAR,
          },
        ],
        isFree: false,
        bestValue: true,
        isLifetime: false,
        credits: {
          enable: true,
          amount: 5700,
          expireDays: 30,
        },
      },
    },
  },
  credits: {
    enableCredits: true,
    enablePackagesForFreePlan: true,
    mode: 'tryout',
    guestFreeRequests: 5,
    userFreeRequests: 3,
    userRefillMinutes: 60,
    // Captcha kicks in for guests when their remaining count drops to this
    // threshold. Should be < guestFreeRequests so users get at least one
    // captcha-free generation. With defaults (5 / 2 / 4): normal guests see
    // captcha on last 2 of 5; anomalous guests see captcha after the 1st.
    guestCaptchaThreshold: 2,
    guestCaptchaThresholdAnomalous: 4,
    registerGiftCredits: {
      enable: true,
      amount: 10,
      expireDays: 30,
    },
    packages: {
      standard: {
        id: 'standard',
        popular: false,
        amount: 4900,
        expireDays: 360,
        price: {
          priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_ENTERPRISE!,
          amount: 19990,
          originalAmount: 44100, // 4900 credits × $0.09 = $441, ~55% off
          currency: 'USD',
          allowPromotionCode: true,
        },
      },
      large: {
        id: 'large',
        popular: false,
        amount: 14900,
        expireDays: 360,
        price: {
          priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_ULTRA!,
          amount: 49990,
          originalAmount: 134100, // 14900 credits × $0.09 = $1341, ~63% off
          currency: 'USD',
          allowPromotionCode: true,
        },
      },
    },
  },
  generation: {
    surfaces: {
      // Public homepage: anonymous users get free-quota generation.
      // Keep this list narrow on purpose — anything added here is
      // exposed to anti-abuse risk. Video models, premium models,
      // and any product whose ProductModel.requiresAuth is true must
      // NOT be listed here (the requiresAuth check is a second gate
      // for defense-in-depth, but the allow-list is the primary one).
      'home-anonymous': {
        allowedModels: ['gpt-image-2'],
        defaultModel: 'gpt-image-2',
        // Server-side execution routing — invisible to the client. The
        // wire-level model id is always 'gpt-image-2'; these rules pick
        // which ExecutableModel actually runs. CN-locale and Chinese-
        // prompt traffic go to the cheaper Grok backend; everyone else
        // hits Apimart's GPT Image 2.
        executionRules: [
          {
            when: { country: ['CN', 'HK', 'MO', 'TW'] },
            executableId: 'grok-imagine-lite-maxapi',
          },
          {
            when: { locale: ['zh'] },
            executableId: 'grok-imagine-lite-maxapi',
          },
          {
            when: { promptIsChinese: true },
            executableId: 'grok-imagine-lite-maxapi',
          },
        ],
        executionFallbackId: 'gpt-image-2-apimart',
      },
      // Authenticated, credit-charged contexts (dashboard, /api/v1).
      // Today we surface a single product; expand as more product
      // ids are wired up to dashboard pickers.
      'user-paid': {
        allowedModels: ['gpt-image-2', 'nano-banana-pro'],
        defaultModel: 'nano-banana-pro',
      },
      // Public bearer-token API (`/api/v1/images/submit`). Stable
      // contract for external integrators — keep the allow-list
      // narrow and stable. No execution rules today: API callers get
      // the canonical product implementation regardless of locale,
      // since they're paying credits and quality matters more than
      // cost optimisation.
      api: {
        allowedModels: ['gpt-image-2'],
        defaultModel: 'gpt-image-2',
      },
    },
    // Video surfaces. `allowedModels` references the frontend-facing
    // video model id (keys of FRONTEND_MODEL_MAPPING). Video has no
    // anonymous / homepage tier today — every video request must be
    // authenticated and credit-charged.
    videoSurfaces: {
      'user-paid': {
        allowedModels: [
          'gemini-omni',
          'veo-3-1',
          'sora2',
          'sora2-pro',
          'seedance-1-0-pro',
          'seedance-1-5-pro',
          'seedance-2-0',
          'seedance-2-0-fast',
          'wan2-7',
          'wan2-6',
          'wan2-2',
          'veo3-ref',
        ],
        defaultModel: 'gemini-omni',
      },
      // Public bearer-token video API. Currently unused at the route
      // level but registered so future programmatic video integrations
      // have a designated allow-list to extend.
      api: {
        allowedModels: ['veo-3-1', 'sora2', 'wan2-6'],
        defaultModel: 'veo-3-1',
      },
    },
  },
};
