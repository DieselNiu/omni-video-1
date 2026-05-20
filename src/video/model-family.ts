/**
 * Model family and version info
 */
export interface ModelFamilyInfo {
  family: string;
  version?: string;
}

/**
 * Extract model family and version from model ID
 * e.g., 'veo3-text-to-video' -> { family: 'veo3' }
 * e.g., 'wan26-text-to-video' -> { family: 'wan', version: '2.6' }
 */
export function getModelFamilyInfo(modelId: string): ModelFamilyInfo {
  if (modelId.includes('veo3')) return { family: 'veo3' };
  if (modelId.includes('sora')) return { family: 'sora2' };
  // sd2_manxue / sd2-manxue → Seedance 2 (separate channel/family
  // from the MaxAPI seedance:2.0 line, so it bypasses channel routing
  // and falls back to the model-config provider).
  if (modelId.includes('sd2-manxue') || modelId.includes('sd2_manxue')) {
    return { family: 'sd2-manxue' };
  }
  if (modelId.includes('seedance')) {
    const versionMatch = modelId.match(/seedance[_-]?(\d)[\._-]?(\d)/i);
    if (versionMatch) {
      return {
        family: 'seedance',
        version: `${versionMatch[1]}.${versionMatch[2]}`,
      };
    }
    return { family: 'seedance' };
  }

  // Wan models - extract version
  if (modelId.includes('wan')) {
    // Match patterns like 'wan22', 'wan26', 'wan2.2', 'wan2.6'
    const versionMatch = modelId.match(/wan[_-]?(\d)[\._-]?(\d)/i);
    if (versionMatch) {
      const version = `${versionMatch[1]}.${versionMatch[2]}`;
      return { family: 'wan', version };
    }
    return { family: 'wan' };
  }

  return { family: 'unknown' };
}

/**
 * Extract model family from model ID
 * e.g., 'veo3-text-to-video' -> 'veo3'
 */
export function getModelFamily(modelId: string): string {
  return getModelFamilyInfo(modelId).family;
}
