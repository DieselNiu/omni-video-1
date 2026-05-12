/**
 * Image Generation Module
 * Provides unified access to image generation providers with channel routing.
 *
 * Phase 2: routing decision is driven by the model registry. Family/version
 * come from `ExecutableModel` directly — no more regex sniffing on modelId.
 * Channel-router override precedence (via `getActiveChannel`) still applies
 * on top of the registry's default binding.
 */

import { getActiveChannel } from '@/lib/channel-router';
import {
  getExecutableById,
  resolve as registryResolve,
} from '@/models/registry';
import type { ExecutableModel, ImageExecutableModel } from '@/models/types';
import { createProvider } from './providers/factory';
import type { ImageChannel } from './providers/types';
import type { ImageProvider } from './types';

/**
 * Result of getImageProvider including the actual channel used.
 * `upstreamBackend` identifies the concrete upstream model family (e.g.
 * 'maxapi-grok' vs 'maxapi-nano-banana') for analytics/dashboards, since
 * `channel` alone collapses env-var-driven variants behind one key.
 */
export interface ImageProviderResult {
  provider: ImageProvider;
  channel: string;
  upstreamBackend: string;
  /** Resolved executable, handy for callers that also want family/version/apiModelId. */
  executable: ExecutableModel;
}

/**
 * Map ExecutableModel.modality array to the channel-router `type` string.
 * The channel router historically keys on 'text-to-image' / 'image-to-image';
 * we preserve that vocabulary. When an executable supports both, pick
 * text-to-image as the default — callers that need i2i-specific routing pass
 * an explicit hint via the (optional) second arg.
 */
function modalityType(
  executable: ExecutableModel,
  hasInputImage?: boolean
): string {
  if (hasInputImage && executable.modality.includes('i2i')) {
    return 'image-to-image';
  }
  if (executable.modality.includes('t2i')) return 'text-to-image';
  return 'image-to-image';
}

/**
 * Get image provider for a specific product id.
 *
 * Registry resolves `productId` → `ExecutableModel`. Channel router then
 * decides the runtime `channel` (respecting DB `channel_config` rows that may
 * override the executable's default `binding.provider`).
 *
 * @param productId - ProductModel.id (e.g. 'gpt-image-2', 'nano-banana-pro', 'nano-banana')
 * @param hasInputImage - Optional hint for modality-specific channel routing
 * @param channelOverride - Pin the runtime channel (legacy). Prefer `executableOverride`.
 * @param executableOverride - Pin the ExecutableModel directly (used by
 *   surface execution rules to route, e.g., zh-locale traffic to a Grok
 *   executable while keeping the wire-level ProductModel id stable).
 */
export async function getImageProvider(
  productId: string,
  hasInputImage?: boolean,
  channelOverride?: string | null,
  executableOverride?: string | null
): Promise<ImageProviderResult> {
  let executable: ImageExecutableModel;
  if (executableOverride) {
    const overridden = getExecutableById(executableOverride) as
      | ImageExecutableModel
      | undefined;
    if (!overridden) {
      throw new Error(
        `[ImageProvider] surface rule pointed at unknown executable "${executableOverride}"`
      );
    }
    executable = overridden;
  } else {
    executable = registryResolve(productId, { hasInputImage })
      .executable as ImageExecutableModel;
  }

  const type = modalityType(executable, hasInputImage);
  const routeResult = channelOverride
    ? null
    : await getActiveChannel(executable.family, type, executable.version);
  // Override > channel-router > registry default. Override exists for
  // request-scoped routing (e.g. CN users → maxapi) where neither env nor
  // DB layers fit because the decision depends on the live request.
  const channel = (channelOverride ??
    routeResult?.channel ??
    executable.binding.provider) as ImageChannel;

  // For MaxAPI, pick the sub-backend from the executable's typed
  // providerOptions (Grok vs Nano Banana). No more env-var hack — the
  // executable encodes its own backend.
  const maxapiBackend =
    channel === 'maxapi' && executable.binding.provider === 'maxapi'
      ? executable.binding.providerOptions?.backend
      : undefined;

  console.log(
    `[ImageProvider] Product: ${productId}, Executable: ${executable.id}, Family: ${executable.family}, Version: ${executable.version}, Type: ${type}, Channel: ${channel}, MaxapiBackend: ${maxapiBackend ?? 'default'}`
  );

  const provider = createProvider(channel, maxapiBackend);
  if (!provider) {
    console.error(
      `[ImageProvider] No provider for channel "${channel}" (product=${productId}, executable=${executable.id}). Check API key configuration.`
    );
    throw new Error(
      'This model is temporarily unavailable. Please try another model or try again later.'
    );
  }

  return {
    provider,
    channel,
    upstreamBackend: provider.getName(),
    executable,
  };
}

/**
 * Initialize image provider (alias for getImageProvider)
 * @deprecated Use getImageProvider instead
 */
export async function initializeImageProvider(
  modelId: string
): Promise<ImageProviderResult> {
  return getImageProvider(modelId);
}

/**
 * Clear all cached provider instances
 */
export { clearProviderCache as clearImageProviderCache } from './providers/factory';

// Re-export types and utilities
export * from './types';
export * from './config/image-models';
export type { ImageChannel } from './providers/types';
