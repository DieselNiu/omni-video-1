import { getActiveChannel } from '@/lib/channel-router';
import {
  VideoModelProvider,
  VideoModelType,
  getVideoModel,
  isKieAiVeo3Model,
  isSora2Model,
} from './config/video-models';
import { getModelFamily, getModelFamilyInfo } from './model-family';
import { AliProvider } from './providers/AliProvider';
import { ApicoreVeo3Provider } from './providers/ApicoreVeo3Provider';
import { BytePlusProvider } from './providers/BytePlusProvider';
import { FalProvider } from './providers/FalProvider';
import { GoogleVeo3Provider } from './providers/GoogleVeo3Provider';
import { KieAiSoraProvider } from './providers/KieAiSoraProvider';
import { KieAiVeo3Provider } from './providers/KieAiVeo3Provider';
import { KieAiWanProvider } from './providers/KieAiWanProvider';
import { KieGeminiOmniProvider } from './providers/KieGeminiOmniProvider';
import { MaxAPIVeoProvider } from './providers/MaxAPIVeoProvider';
import { MaxApiProvider } from './providers/MaxApiProvider';
import { VertexAIVeo3Provider } from './providers/VertexAIVeo3Provider';
import { VolcanoProvider } from './providers/VolcanoProvider';
import type { VideoProvider } from './types';

// Provider instance cache
const providerInstances: Map<string, VideoProvider> = new Map();

/**
 * Get model type string from VideoModelType
 */
function getModelTypeString(type: VideoModelType): string {
  return type === VideoModelType.TEXT_TO_VIDEO
    ? 'text-to-video'
    : 'image-to-video';
}

/**
 * Get provider instance by channel and family
 * Channel routing allows dynamic switching between providers without code changes
 *
 * Supported channels for each family:
 * - veo3: 'kie', 'apicore'
 * - sora2: 'kie'
 * - gemini-omni: 'kie'
 * - wan: 'kie', 'ali'
 * - seedance: 'byteplus', 'volcano'
 */
function getProviderByChannel(
  channel: string,
  family: string,
  apiModelId?: string | null
): VideoProvider | null {
  switch (channel) {
    case 'google': {
      const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!geminiApiKey) {
        console.error('GOOGLE_GENERATIVE_AI_API_KEY not configured');
        return null;
      }
      return new GoogleVeo3Provider(geminiApiKey);
    }
    case 'kie': {
      const kieaiApiKey = process.env.KIE_AI_API_KEY;
      if (!kieaiApiKey) {
        console.error('KIE_AI_API_KEY not configured');
        return null;
      }
      if (family === 'sora2') {
        return new KieAiSoraProvider(kieaiApiKey);
      }
      if (family === 'gemini-omni') {
        return new KieGeminiOmniProvider(kieaiApiKey);
      }
      if (family === 'wan') {
        return new KieAiWanProvider(kieaiApiKey);
      }
      return new KieAiVeo3Provider(kieaiApiKey);
    }
    case 'apicore': {
      const apicoreApiKey = process.env.APICORE_API_KEY;
      if (!apicoreApiKey) {
        console.error('APICORE_API_KEY not configured');
        return null;
      }
      return new ApicoreVeo3Provider(apicoreApiKey);
    }
    case 'byteplus': {
      const byteplusApiKey = process.env.BYTEPLUS_API_KEY;
      if (!byteplusApiKey) {
        console.error('BYTEPLUS_API_KEY not configured');
        return null;
      }
      return new BytePlusProvider(byteplusApiKey, apiModelId);
    }
    case 'volcano': {
      const arkApiKey = process.env.ARK_API_KEY;
      if (!arkApiKey) {
        console.error('ARK_API_KEY not configured');
        return null;
      }
      return new VolcanoProvider(arkApiKey, apiModelId);
    }
    case 'ali': {
      const aliApiKey = process.env.ALI_API_KEY;
      if (!aliApiKey) {
        console.error('ALI_API_KEY not configured');
        return null;
      }
      return new AliProvider(aliApiKey);
    }
    case 'fal': {
      const falKey = process.env.FAL_KEY;
      if (!falKey) {
        console.error('FAL_KEY not configured');
        return null;
      }
      return new FalProvider();
    }
    case 'vertex': {
      const projectId = process.env.GOOGLE_VERTEX_PROJECT;
      const location = process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
      const keyFilePath =
        process.env.GOOGLE_APPLICATION_CREDENTIALS || './key.json';
      const gcsBucket = process.env.GOOGLE_VERTEX_GCS_BUCKET;
      if (!projectId) {
        console.error('GOOGLE_VERTEX_PROJECT not configured');
        return null;
      }
      if (family === 'veo3') {
        return new VertexAIVeo3Provider({
          projectId,
          location,
          keyFilePath,
        });
      }
      // Vertex AI currently only supports Veo3
      console.error(`Vertex AI does not support family: ${family}`);
      return null;
    }
    case 'maxapi': {
      const maxapiKey = process.env.MAXAPI_API_KEY;
      if (!maxapiKey) {
        console.error('MAXAPI_API_KEY not configured');
        return null;
      }

      // 根据 family 返回不同的 Provider
      if (family === 'veo3') {
        return new MaxAPIVeoProvider(maxapiKey);
      }

      // Seedance 使用统一的 MaxApiProvider
      return new MaxApiProvider(maxapiKey);
    }
    default:
      return null;
  }
}

/**
 * Get provider cache key based on model ID
 */
function getProviderCacheKey(
  provider: VideoModelProvider,
  modelId: string
): string {
  if (provider === VideoModelProvider.KIEAI) {
    if (modelId.includes('gemini-omni')) {
      return `${provider}:gemini-omni`;
    }
    if (isSora2Model(modelId)) {
      return `${provider}:sora2`;
    }
    if (isKieAiVeo3Model(modelId)) {
      return `${provider}:veo3`;
    }
    return `${provider}:${modelId}`;
  }
  // Other providers use single instance per provider
  return provider;
}

/**
 * Result of getVideoProvider including the actual channel used
 */
export interface VideoProviderResult {
  provider: VideoProvider;
  channel: string;
  apiModelId?: string | null;
}

/**
 * Get video provider for a specific model
 * Uses channel routing to determine the actual provider to use
 * Supports version-level routing (e.g., wan:2.2 -> kie, wan:2.6 -> ali)
 * @param modelId - The model ID to get provider for
 * @returns VideoProvider instance and the actual channel used
 */
export async function getVideoProvider(
  modelId: string,
  /**
   * Pin to a specific channel, bypassing the runtime channel router. Used
   * by the cron sweeper and any other code that needs to talk to the
   * exact provider that handled the original submit — the router may have
   * been re-pointed since then and the asset's `providerRequestId` only
   * makes sense to that original channel.
   */
  channelOverride?: string | null
): Promise<VideoProviderResult> {
  const modelConfig = getVideoModel(modelId);
  if (!modelConfig) {
    throw new Error(`Unknown video model: ${modelId}`);
  }

  // Extract model family, version, and type for channel routing
  const { family, version } = getModelFamilyInfo(modelId);
  const modelType = getModelTypeString(modelConfig.type);

  // Get the active channel from configuration (supports version-level routing)
  // — unless the caller pinned a channel, in which case skip the lookup.
  const routeResult = channelOverride
    ? { channel: channelOverride, apiModelId: null as string | null }
    : await getActiveChannel(family, modelType, version);
  const activeChannel = routeResult?.channel ?? null;
  const apiModelId = routeResult?.apiModelId ?? null;
  console.log(
    `[VideoProvider] Model: ${modelId}, Family: ${family}, Version: ${version || 'N/A'}, Type: ${modelType}, Channel: ${activeChannel || 'model-config'}${apiModelId ? `, ApiModelId: ${apiModelId}` : ''}`
  );

  // Try to get provider from channel routing if configured
  if (activeChannel) {
    // Include apiModelId in cache key so different overrides get separate instances
    const cacheKey = [activeChannel, family, version, apiModelId]
      .filter(Boolean)
      .join(':');
    if (!providerInstances.has(cacheKey)) {
      const routedProvider = getProviderByChannel(
        activeChannel,
        family,
        apiModelId
      );
      if (routedProvider) {
        providerInstances.set(cacheKey, routedProvider);
      }
    }
    const cachedProvider = providerInstances.get(cacheKey);
    if (cachedProvider) {
      return {
        provider: cachedProvider,
        channel: activeChannel,
        apiModelId,
      };
    }
  }

  // Use model config provider (no channel routing or routing failed)
  const fallbackChannel = modelConfig.provider;
  console.log(
    `[VideoProvider] Using model config provider: ${fallbackChannel}`
  );

  const cacheKey = getProviderCacheKey(modelConfig.provider, modelId);

  // Return cached instance if available
  if (providerInstances.has(cacheKey)) {
    return {
      provider: providerInstances.get(cacheKey)!,
      channel: fallbackChannel,
    };
  }

  let provider: VideoProvider;

  switch (modelConfig.provider) {
    case VideoModelProvider.KIEAI: {
      const kieaiApiKey = process.env.KIE_AI_API_KEY;
      if (!kieaiApiKey) {
        throw new Error(
          'KIE_AI_API_KEY environment variable is required for Kie.ai models'
        );
      }

      // Route to different providers based on model type
      if (isSora2Model(modelId)) {
        provider = new KieAiSoraProvider(kieaiApiKey);
      } else if (modelId.includes('gemini-omni')) {
        provider = new KieGeminiOmniProvider(kieaiApiKey);
      } else if (isKieAiVeo3Model(modelId)) {
        provider = new KieAiVeo3Provider(kieaiApiKey);
      } else {
        // Default to Veo3 for backward compatibility
        provider = new KieAiVeo3Provider(kieaiApiKey);
      }
      break;
    }

    case VideoModelProvider.VOLCANO: {
      const arkApiKey = process.env.ARK_API_KEY;
      if (!arkApiKey) {
        throw new Error(
          'ARK_API_KEY environment variable is required for Volcano Engine models'
        );
      }
      provider = new VolcanoProvider(arkApiKey);
      break;
    }

    case VideoModelProvider.BYTEPLUS: {
      const byteplusApiKey = process.env.BYTEPLUS_API_KEY;
      if (!byteplusApiKey) {
        throw new Error(
          'BYTEPLUS_API_KEY environment variable is required for BytePlus models'
        );
      }
      provider = new BytePlusProvider(byteplusApiKey);
      break;
    }

    case VideoModelProvider.MAXAPI: {
      const maxapiKey = process.env.MAXAPI_API_KEY;
      if (!maxapiKey) {
        throw new Error(
          'MAXAPI_API_KEY environment variable is required for MaxAPI models'
        );
      }
      provider = new MaxApiProvider(maxapiKey);
      break;
    }

    case VideoModelProvider.APICORE: {
      const apicoreApiKey = process.env.APICORE_API_KEY;
      if (!apicoreApiKey) {
        throw new Error(
          'APICORE_API_KEY environment variable is required for APICore Veo3 models'
        );
      }
      provider = new ApicoreVeo3Provider(apicoreApiKey);
      break;
    }

    case VideoModelProvider.FAL: {
      const falKey = process.env.FAL_KEY;
      if (!falKey) {
        throw new Error(
          'FAL_KEY environment variable is required for Fal.ai models'
        );
      }
      provider = new FalProvider();
      break;
    }

    case VideoModelProvider.ALI: {
      const aliApiKey = process.env.ALI_API_KEY;
      if (!aliApiKey) {
        throw new Error(
          'ALI_API_KEY environment variable is required for Ali Bailian models'
        );
      }
      provider = new AliProvider(aliApiKey);
      break;
    }

    default:
      throw new Error(`Unsupported video provider: ${modelConfig.provider}`);
  }

  // Cache the instance
  providerInstances.set(cacheKey, provider);

  return { provider, channel: fallbackChannel };
}

/**
 * Initialize video provider for a specific model (alias for getVideoProvider)
 * @param modelId - The model ID to initialize provider for
 * @returns VideoProvider instance and the actual channel used
 */
export async function initializeVideoProvider(
  modelId: string
): Promise<VideoProviderResult> {
  return getVideoProvider(modelId);
}

/**
 * Clear all cached provider instances
 */
export function clearProviderCache(): void {
  providerInstances.clear();
}

// Re-export types and utilities
export * from './types';
export * from './config/video-models';
