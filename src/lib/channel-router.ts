/**
 * Channel Router Module
 *
 * Routes requests to the appropriate API channel. Priority order:
 *   1. Env override    — IMAGE_VENDOR__<FAMILY>_<VERSION> (highest)
 *   2. DB channel_config row (by family:version:type / family:type)
 *   3. DEFAULT_CHANNELS constant (by family:version / family)
 *   4. null            — caller falls back to ExecutableModel.binding.provider
 *
 * The env layer exists for fast dev iteration + emergency vendor swaps. The
 * DB layer is for per-env / gradual rollouts. DEFAULT_CHANNELS is the
 * code-shipped baseline.
 */

import { getDb } from '@/db';
import { channelConfig } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';

// Channel routing result
export interface ChannelRouteResult {
  channel: string;
  apiModelId?: string | null;
}

// In-memory cache for channel configurations
let channelCache: Map<string, ChannelRouteResult> | null = null;

// Default channels for each model family and version
// Supports both family-level ('wan') and version-level ('wan:2.6') keys
// Version-specific config takes precedence over family-level config
//
// Available channels for veo3:
// - 'maxapi': MaxAPI production API (requires MAXAPI_API_KEY)
// - 'vertex': Vertex AI production API (requires GOOGLE_CLOUD_PROJECT + key.json)
// - 'google': Google AI Studio API (requires GOOGLE_GENERATIVE_AI_API_KEY)
// - 'kie': Kie.ai third-party API (requires KIE_AI_API_KEY)
// - 'apicore': APICore third-party API (requires APICORE_API_KEY)
const DEFAULT_CHANNELS: Record<string, string> = {
  // Veo3 - 从 'flow' 改为 'maxapi'
  veo3: 'maxapi',

  // Nano Banana - keep defaults version-specific so channel-router does not
  // pair a provider with an ExecutableModel bound to a different provider.
  'nano-banana:1': 'apimart',
  'nano-banana:pro': 'kie',
  'nano-banana:2': 'kie',

  // Sora（保持不变）
  sora2: 'kie',

  // Gemini Omni unified video generation
  'gemini-omni': 'kie',

  // Seedance - version-specific routing. 2.0 / 2.0 Fast now talk to
  // BytePlus Ark directly; earlier versions stay on the same channel.
  'seedance:2.0': 'byteplus',
  seedance: 'byteplus',

  // Wan - version-specific routing（保持不变）
  'wan:2.2': 'ali',
  'wan:2.6': 'ali',
};

/**
 * Compute the env var name for a (family, version) pair.
 *
 *   nano-banana + pro → IMAGE_VENDOR__NANO_BANANA_PRO
 *   gpt-image   + 2   → IMAGE_VENDOR__GPT_IMAGE_2
 *   wan         + 2.6 → IMAGE_VENDOR__WAN_2_6
 *
 * Dash and dot collapse to underscore; entire key uppercased. Keep this in
 * lockstep with the names documented in env.example.
 */
function envKeyFor(family: string, version?: string): string {
  const safeFamily = family.replace(/[-.]/g, '_').toUpperCase();
  if (!version) return `IMAGE_VENDOR__${safeFamily}`;
  const safeVersion = version.replace(/[-.]/g, '_').toUpperCase();
  return `IMAGE_VENDOR__${safeFamily}_${safeVersion}`;
}

/**
 * Read an env-var override for (family, version). Tries the version-specific
 * key first, then the family-only key. Empty string is treated as unset.
 */
function getEnvChannelOverride(
  family: string,
  version?: string
): string | null {
  if (version) {
    const versioned = process.env[envKeyFor(family, version)];
    if (versioned && versioned.trim().length > 0) {
      return versioned.trim();
    }
  }
  const familyOnly = process.env[envKeyFor(family)];
  if (familyOnly && familyOnly.trim().length > 0) {
    return familyOnly.trim();
  }
  return null;
}

/**
 * Get the active channel for a model family, version, and type.
 *
 * Priority: env override → DB channel_config → DEFAULT_CHANNELS → null.
 *
 * @param family - Model family (e.g., 'veo3', 'wan', 'nano-banana', 'gpt-image')
 * @param type - Model type (e.g., 'text-to-video', 'text-to-image')
 * @param version - Optional model version (e.g., '2.2', 'pro')
 * @returns The channel route result, or null if no layer configured it
 */
export async function getActiveChannel(
  family: string,
  type: string,
  version?: string
): Promise<ChannelRouteResult | null> {
  // Layer 1: env override (highest priority). No apiModelId override possible
  // through env — callers fall back to the ExecutableModel.binding.apiModelId.
  const envChannel = getEnvChannelOverride(family, version);
  if (envChannel) {
    console.log(
      `[ChannelRouter] Env override applied: ${family}${version ? `:${version}` : ''} → ${envChannel} (via ${envKeyFor(family, version)})`
    );
    return { channel: envChannel };
  }

  // Ensure cache is initialized
  if (!channelCache) {
    await refreshChannelCache();
  }

  // Build lookup keys with priority order
  const versionKey = version ? `${family}:${version}:${type}` : null;
  const familyKey = `${family}:${type}`;

  // Layer 2: DB cache
  if (channelCache) {
    if (versionKey && channelCache.has(versionKey)) {
      return channelCache.get(versionKey)!;
    }
    if (channelCache.has(familyKey)) {
      return channelCache.get(familyKey)!;
    }
  }

  // Layer 3: DEFAULT_CHANNELS (code-shipped baseline)
  if (version) {
    const versionDefault = DEFAULT_CHANNELS[`${family}:${version}`];
    if (versionDefault) {
      return { channel: versionDefault };
    }
  }
  const familyDefault = DEFAULT_CHANNELS[family];
  if (familyDefault) {
    return { channel: familyDefault };
  }

  // Layer 4: caller falls back to ExecutableModel.binding.provider
  return null;
}

/**
 * Refresh the channel cache from the database
 * Call this on server startup and after configuration changes
 */
export async function refreshChannelCache(): Promise<void> {
  try {
    const db = await getDb();
    const configs = await db
      .select()
      .from(channelConfig)
      .where(eq(channelConfig.enabled, true))
      .orderBy(asc(channelConfig.priority));

    const newCache = new Map<string, ChannelRouteResult>();

    for (const config of configs) {
      // Build cache key with optional modelVersion for version-level routing
      const key = config.modelVersion
        ? `${config.modelFamily}:${config.modelVersion}:${config.modelType}`
        : `${config.modelFamily}:${config.modelType}`;
      // Only keep the highest priority (lowest number) channel
      if (!newCache.has(key)) {
        newCache.set(key, {
          channel: config.channel,
          apiModelId: config.apiModelId,
        });
      }
    }

    channelCache = newCache;
    console.log(
      '[ChannelRouter] Cache refreshed:',
      Object.fromEntries(newCache)
    );
  } catch (error) {
    console.error('[ChannelRouter] Failed to refresh cache:', error);
    // Keep the old cache if refresh fails
  }
}

/**
 * Check if the channel cache is initialized
 */
export function isChannelCacheInitialized(): boolean {
  return channelCache !== null;
}

/**
 * Get all cached channel configurations (for debugging)
 */
export function getChannelCacheSnapshot(): Record<string, ChannelRouteResult> {
  if (!channelCache) {
    return {};
  }
  return Object.fromEntries(channelCache);
}

/**
 * Initialize the channel cache if not already initialized
 */
export async function ensureChannelCacheInitialized(): Promise<void> {
  if (!channelCache) {
    await refreshChannelCache();
  }
}
