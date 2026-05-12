/**
 * Image Provider Factory
 * Creates provider instances based on channel configuration
 */

import type { ImageProvider } from '../types';
import { ApimartProvider } from './ApimartProvider';
import { GoogleNanoBananaProvider } from './GoogleNanoBananaProvider';
import { KieNanoBananaProvider } from './KieNanoBananaProvider';
import { MaxAPIGrokProvider } from './MaxAPIGrokProvider';
import { MaxAPINanoBananaProvider } from './MaxAPINanoBananaProvider';
import { VertexAINanoBananaProvider } from './VertexAINanoBananaProvider';
import { IMAGE_CHANNELS, type ImageChannel } from './types';

// Provider instance cache. Key includes the sub-backend for channels that
// multiplex upstreams (e.g. maxapi -> nano-banana | grok) so callers using
// different MaxAPI sub-backends each get the right instance.
const providerCache = new Map<string, ImageProvider>();

/** Optional sub-backend selector for channels that multiplex upstream APIs
 *  behind a single key (currently only maxapi). The backend is decided
 *  per-ExecutableModel via `binding.providerOptions.backend`; callers that
 *  don't need to override leave this undefined and get the channel default.
 */
export type MaxapiBackend = 'nano-banana' | 'grok';

/**
 * Create a provider instance for the given channel.
 *
 * `maxapiBackend` is consulted only when `channel === 'maxapi'` and lets the
 * caller pin the sub-backend (nano-banana vs grok). When omitted, defaults
 * to nano-banana — the single user-facing default for any code path that
 * hasn't migrated to per-ExecutableModel routing yet.
 */
export function createProvider(
  channel: ImageChannel,
  maxapiBackend?: MaxapiBackend
): ImageProvider | null {
  const variant: string =
    channel === 'maxapi' ? (maxapiBackend ?? 'nano-banana') : '';
  const cacheKey = variant ? `${channel}:${variant}` : channel;

  if (providerCache.has(cacheKey)) {
    return providerCache.get(cacheKey)!;
  }

  const config = IMAGE_CHANNELS[channel];
  if (!config) {
    console.error(`Unknown channel: ${channel}`);
    return null;
  }

  const apiKey = process.env[config.envKey];
  if (!apiKey) {
    console.error(`${config.envKey} not configured for ${config.displayName}`);
    return null;
  }

  const provider = instantiateProvider(channel, apiKey, maxapiBackend);
  if (provider) {
    providerCache.set(cacheKey, provider);
  }

  return provider;
}

/**
 * Instantiate a provider based on channel type.
 *
 * For `maxapi`, picks Grok vs Nano Banana from the per-ExecutableModel
 * `maxapiBackend` argument. There is no env-var fallback — routing is
 * encoded in the ExecutableModel registry / surface rules, not env.
 */
function instantiateProvider(
  channel: ImageChannel,
  apiKey: string,
  maxapiBackend?: MaxapiBackend
): ImageProvider | null {
  switch (channel) {
    case 'kie':
      return new KieNanoBananaProvider(apiKey);
    case 'google':
      return new GoogleNanoBananaProvider(apiKey);
    case 'vertex':
      return new VertexAINanoBananaProvider({
        projectId: process.env.GOOGLE_VERTEX_PROJECT!,
        location: process.env.GOOGLE_VERTEX_LOCATION || 'us-central1',
        keyFilePath: process.env.GOOGLE_APPLICATION_CREDENTIALS || './key.json',
      });
    case 'maxapi':
      if (maxapiBackend === 'grok') {
        return new MaxAPIGrokProvider(apiKey);
      }
      return new MaxAPINanoBananaProvider(apiKey);
    case 'apimart':
      return new ApimartProvider(apiKey);
    default:
      return null;
  }
}

/**
 * Clear the provider cache
 */
export function clearProviderCache(): void {
  providerCache.clear();
}

/**
 * Check if a channel's API key is configured
 */
export function isChannelConfigured(channel: ImageChannel): boolean {
  const config = IMAGE_CHANNELS[channel];
  return config ? !!process.env[config.envKey] : false;
}
