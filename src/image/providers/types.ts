/**
 * Image Provider Channel Types
 */

// Supported channels for image generation
export type ImageChannel =
  | 'kie'
  | 'google'
  | 'vertex'
  | 'maxapi'
  | 'apimart'
  | 'ali';

// Channel configuration
export interface ChannelConfig {
  channel: ImageChannel;
  envKey: string;
  displayName: string;
}

// Channel registry
export const IMAGE_CHANNELS: Record<ImageChannel, ChannelConfig> = {
  kie: {
    channel: 'kie',
    envKey: 'KIE_AI_API_KEY',
    displayName: 'Kie.ai',
  },
  google: {
    channel: 'google',
    envKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    displayName: 'Google AI Studio',
  },
  vertex: {
    channel: 'vertex',
    envKey: 'GOOGLE_VERTEX_PROJECT',
    displayName: 'Vertex AI',
  },
  maxapi: {
    channel: 'maxapi',
    envKey: 'MAXAPI_API_KEY',
    displayName: 'MaxAPI',
  },
  apimart: {
    channel: 'apimart',
    envKey: 'APIMART_API_KEY',
    displayName: 'Apimart',
  },
  ali: {
    channel: 'ali',
    envKey: 'ALI_API_KEY',
    displayName: 'Alibaba DashScope',
  },
};

// Model family to default channel mapping
export const DEFAULT_CHANNEL_BY_FAMILY: Record<string, ImageChannel> = {
  'nano-banana': 'kie',
  wan: 'ali',
};
