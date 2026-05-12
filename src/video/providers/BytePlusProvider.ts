import { BaseArkProvider } from './BaseArkProvider';

/**
 * BytePlus Seedance Pro video generation provider
 * Extends BaseArkProvider with Southeast Asia endpoint
 */
export class BytePlusProvider extends BaseArkProvider {
  protected baseUrl = 'https://ark.ap-southeast.bytepluses.com/api/v3';
  protected providerName = 'byteplus';

  protected getProviderDisplayName(): string {
    return 'BytePlus';
  }

  getName(): string {
    return 'byteplus';
  }
}
