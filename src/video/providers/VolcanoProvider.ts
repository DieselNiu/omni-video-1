import { BaseArkProvider } from './BaseArkProvider';

/**
 * Volcano Engine (火山引擎) video generation provider
 * Extends BaseArkProvider with China mainland endpoint
 */
export class VolcanoProvider extends BaseArkProvider {
  protected baseUrl = 'https://ark.cn-beijing.volces.com/api/v3';
  protected providerName = 'volcano';

  protected getProviderDisplayName(): string {
    return 'Volcano Engine';
  }

  getName(): string {
    return 'volcano';
  }
}
