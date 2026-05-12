import { websiteConfig } from '@/config/website';
import { NowPaymentsProvider } from './provider/nowpayments';
import { PayPalProvider } from './provider/paypal';
import { StripeProvider } from './provider/stripe';
import type {
  CheckoutResult,
  CreateCheckoutParams,
  CreateCreditCheckoutParams,
  CreatePortalParams,
  PaymentProvider,
  PaymentProviderType,
  PortalResult,
} from './types';

/**
 * Global payment provider instances (cached)
 */
const providerInstances: Partial<Record<PaymentProviderType, PaymentProvider>> =
  {};

/**
 * Get payment provider by name
 */
export const getPaymentProviderByName = (
  providerName: PaymentProviderType
): PaymentProvider => {
  if (providerInstances[providerName]) {
    return providerInstances[providerName]!;
  }

  let provider: PaymentProvider;
  switch (providerName) {
    case 'stripe':
      provider = new StripeProvider();
      break;
    case 'paypal':
      provider = new PayPalProvider();
      break;
    case 'nowpayments':
      provider = new NowPaymentsProvider();
      break;
    default:
      throw new Error(`Unsupported payment provider: ${providerName}`);
  }

  providerInstances[providerName] = provider;
  return provider;
};

/**
 * Get the default payment provider (based on website config)
 */
export const getPaymentProvider = (): PaymentProvider => {
  const defaultProvider = websiteConfig.payment.provider as PaymentProviderType;
  return getPaymentProviderByName(defaultProvider);
};

/**
 * Initialize the payment provider (alias for getPaymentProvider for backward compatibility)
 */
export const initializePaymentProvider = (): PaymentProvider => {
  return getPaymentProvider();
};

/**
 * Create a checkout session for a plan
 */
export const createCheckout = async (
  params: CreateCheckoutParams
): Promise<CheckoutResult> => {
  const providerName =
    params.provider ?? (websiteConfig.payment.provider as PaymentProviderType);
  const provider = getPaymentProviderByName(providerName);
  return provider.createCheckout(params);
};

/**
 * Create a checkout session for a credit package
 */
export const createCreditCheckout = async (
  params: CreateCreditCheckoutParams
): Promise<CheckoutResult> => {
  const providerName =
    params.provider ?? (websiteConfig.payment.provider as PaymentProviderType);
  const provider = getPaymentProviderByName(providerName);
  return provider.createCreditCheckout(params);
};

/**
 * Create a customer portal session
 */
export const createCustomerPortal = async (
  params: CreatePortalParams,
  providerName?: PaymentProviderType
): Promise<PortalResult> => {
  const provider = getPaymentProviderByName(
    providerName ?? (websiteConfig.payment.provider as PaymentProviderType)
  );
  return provider.createCustomerPortal(params);
};

/**
 * Handle webhook event
 */
export const handleWebhookEvent = async (
  payload: string,
  signature: string,
  providerName?: PaymentProviderType
): Promise<void> => {
  const provider = getPaymentProviderByName(
    providerName ?? (websiteConfig.payment.provider as PaymentProviderType)
  );
  await provider.handleWebhookEvent(payload, signature);
};
