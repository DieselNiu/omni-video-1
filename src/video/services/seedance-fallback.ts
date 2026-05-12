/**
 * Seedance Fallback Service (DEPRECATED)
 *
 * NOTE: Volcano Seedance models have been removed from the main config.
 * This fallback service is kept for legacy cost optimization but is disabled by default.
 *
 * Strategy: Prioritize Volcano (cheaper), fallback to BytePlus (stable) on failure
 *
 * To disable:
 * 1. Delete this file
 * 2. Remove import and tryVolcanoSubmit call from submit route
 * 3. Delete environment variable ENABLE_VOLCANO_FALLBACK
 *
 * To enable (not recommended):
 * Set ENABLE_VOLCANO_FALLBACK=true in environment variables
 */

import { VolcanoProvider } from '../providers/VolcanoProvider';
import type { VideoGenerationRequest, VideoGenerationResponse } from '../types';

// Volcano model ID for direct API calls (legacy - may need update for newer Volcano models)
const VOLCANO_SEEDANCE_MODEL_ID = 'doubao-seedance-1-0-pro-250528';

// Singleton instance
let volcanoProviderInstance: VolcanoProvider | null = null;

/**
 * Check if Volcano fallback is enabled
 */
export function isVolcanoFallbackEnabled(): boolean {
  return process.env.ENABLE_VOLCANO_FALLBACK === 'true';
}

/**
 * Check if model is a BytePlus Seedance model
 */
export function isBytePlusSeedanceModel(modelId: string): boolean {
  return modelId.includes('seedance') && modelId.includes('1.0-pro');
}

/**
 * Get or create Volcano provider instance
 */
function getVolcanoProvider(): VolcanoProvider {
  if (!volcanoProviderInstance) {
    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) {
      throw new Error('ARK_API_KEY is required for Volcano fallback');
    }
    volcanoProviderInstance = new VolcanoProvider(apiKey);
  }
  return volcanoProviderInstance;
}

/**
 * Get provider for status queries based on actual_provider in metadata
 *
 * @param actualProvider - The actual provider from metadata ("volcano" or other)
 * @returns VolcanoProvider if actualProvider is "volcano", null otherwise
 */
export function getStatusProviderForFallback(
  actualProvider: string | undefined
): VolcanoProvider | null {
  if (actualProvider === 'volcano') {
    console.log(
      '[Volcano Fallback] Detected actual_provider=volcano, using VolcanoProvider for status'
    );
    return getVolcanoProvider();
  }
  return null;
}

/**
 * Try to submit video generation via Volcano
 *
 * @param modelId - Original model ID (e.g., seedance-1.0-pro-text-to-video)
 * @param input - Video generation request parameters
 * @param webhookUrl - Webhook callback URL
 * @returns Response if successful, null if failed (will fallback to BytePlus)
 */
export async function tryVolcanoSubmit(
  modelId: string,
  input: VideoGenerationRequest,
  webhookUrl?: string
): Promise<VideoGenerationResponse | null> {
  // Check if fallback is enabled and model is supported
  if (!isVolcanoFallbackEnabled() || !isBytePlusSeedanceModel(modelId)) {
    return null;
  }

  try {
    console.log('[Volcano Fallback] Attempting Volcano Engine...');

    const volcanoProvider = getVolcanoProvider();

    // Build Volcano-specific input with Volcano model ID
    const volcanoInput: VideoGenerationRequest = {
      ...input,
      model: VOLCANO_SEEDANCE_MODEL_ID,
    };

    const response = await volcanoProvider.submit(
      modelId,
      volcanoInput,
      webhookUrl
    );

    console.log(
      '[Volcano Fallback] Volcano Engine request successful, request_id:',
      response.request_id
    );

    return response;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(
      '[Volcano Fallback] Volcano Engine failed, falling back to BytePlus:',
      errorMsg
    );
    return null;
  }
}

/**
 * Clear the cached Volcano provider instance
 * Useful for testing or when API key changes
 */
export function clearVolcanoProviderCache(): void {
  volcanoProviderInstance = null;
}
