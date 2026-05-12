import { randomUUID } from 'crypto';
import { websiteConfig } from '@/config/website';
import {
  addCredits,
  addLifetimeMonthlyCredits,
  addSubscriptionCredits,
} from '@/credits/credits';
import { getCreditPackageById } from '@/credits/server';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { getDb } from '@/db';
import { payment, user } from '@/db/schema';
import type { Payment } from '@/db/types';
import { defaultMessages } from '@/i18n/messages';
import { trackServerEvent } from '@/lib/analytics/server';
import { grantNanoFamilyEntitlementForSubscription } from '@/lib/entitlements/entitlements';
import { findPlanByPlanId, findPriceInPlan } from '@/lib/price-plan';
import { sendNotification } from '@/notification/notification';
import { desc, eq } from 'drizzle-orm';
import {
  type CheckoutResult,
  type CreateCheckoutParams,
  type CreateCreditCheckoutParams,
  type CreatePortalParams,
  type PaymentProvider,
  PaymentScenes,
  type PaymentStatus,
  PaymentTypes,
  type PlanInterval,
  PlanIntervals,
  type PortalResult,
} from '../types';

/**
 * PayPal payment provider implementation
 *
 * Supports:
 * - One-time payments (Orders API v2)
 * - Subscription payments (Subscriptions API)
 * - Dynamic Product/Plan creation (no pre-configuration needed)
 *
 * @see https://developer.paypal.com/docs/api/orders/v2/
 * @see https://developer.paypal.com/docs/api/subscriptions/v1/
 */
export class PayPalProvider implements PaymentProvider {
  private baseUrl: string;
  private accessToken?: string;
  private tokenExpiry?: number;
  private webhookId?: string;

  /**
   * Initialize PayPal provider
   * Environment is auto-detected from NODE_ENV
   */
  constructor() {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    if (!clientId) {
      throw new Error(
        'NEXT_PUBLIC_PAYPAL_CLIENT_ID environment variable is not set'
      );
    }

    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientSecret) {
      throw new Error('PAYPAL_CLIENT_SECRET environment variable is not set');
    }

    this.webhookId = process.env.PAYPAL_WEBHOOK_ID;

    // Auto-detect environment based on NODE_ENV
    const isProduction = process.env.NODE_ENV === 'production';
    this.baseUrl = isProduction
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  /**
   * Create a checkout session for a plan (subscription)
   */
  public async createCheckout(
    params: CreateCheckoutParams
  ): Promise<CheckoutResult> {
    const { planId, priceId, customerEmail, successUrl, cancelUrl, metadata } =
      params;

    try {
      await this.ensureAccessToken();

      // Get plan and price
      const plan = findPlanByPlanId(planId);
      if (!plan) {
        throw new Error(`Plan with ID ${planId} not found`);
      }

      const price = findPriceInPlan(planId, priceId);
      if (!price) {
        throw new Error(`Price ID ${priceId} not found in plan ${planId}`);
      }

      // For subscriptions, dynamically create Product -> Plan -> Subscription
      if (price.type === PaymentTypes.SUBSCRIPTION) {
        return await this.createSubscriptionPayment({
          plan,
          price,
          customerEmail,
          successUrl: successUrl ?? '',
          cancelUrl: cancelUrl ?? '',
          metadata: { ...metadata, planId, priceId },
        });
      }

      // For lifetime/one-time payments
      return await this.createOneTimePayment({
        plan,
        price,
        customerEmail,
        successUrl: successUrl ?? '',
        cancelUrl: cancelUrl ?? '',
        metadata: { ...metadata, planId, priceId },
        scene: PaymentScenes.LIFETIME,
      });
    } catch (error) {
      console.error('PayPal createCheckout error:', error);
      throw new Error('Failed to create PayPal checkout');
    }
  }

  /**
   * Create a checkout session for credit package (one-time payment)
   */
  public async createCreditCheckout(
    params: CreateCreditCheckoutParams
  ): Promise<CheckoutResult> {
    const { packageId, customerEmail, successUrl, cancelUrl, metadata } =
      params;

    try {
      await this.ensureAccessToken();

      // Get credit package
      const creditPackage = getCreditPackageById(packageId);
      if (!creditPackage) {
        throw new Error(`Credit package with ID ${packageId} not found`);
      }

      const priceId = creditPackage.price.priceId;
      if (!priceId) {
        throw new Error(`Price ID not found for credit package ${packageId}`);
      }

      return await this.createOneTimePayment({
        plan: {
          id: packageId,
          name: creditPackage.name,
          description: `${creditPackage.amount} Credits`,
          isFree: false,
          isLifetime: false,
          prices: [creditPackage.price],
        },
        price: creditPackage.price,
        customerEmail,
        successUrl: successUrl ?? '',
        cancelUrl: cancelUrl ?? '',
        metadata: {
          ...metadata,
          packageId,
          priceId,
          credits: String(creditPackage.amount),
          type: 'credit_purchase',
        },
        scene: PaymentScenes.CREDIT,
      });
    } catch (error) {
      console.error('PayPal createCreditCheckout error:', error);
      throw new Error('Failed to create PayPal credit checkout');
    }
  }

  /**
   * Create a customer portal session
   * Note: PayPal doesn't have a direct billing portal like Stripe
   * We return a link to PayPal's subscription management page
   */
  public async createCustomerPortal(
    _params: CreatePortalParams
  ): Promise<PortalResult> {
    const isProduction = process.env.NODE_ENV === 'production';
    const portalUrl = isProduction
      ? 'https://www.paypal.com/myaccount/autopay'
      : 'https://www.sandbox.paypal.com/myaccount/autopay';

    return {
      url: portalUrl,
    };
  }

  /**
   * Handle webhook events from PayPal
   */
  public async handleWebhookEvent(
    payload: string,
    headersJson: string
  ): Promise<void> {
    try {
      await this.ensureAccessToken();

      const event = JSON.parse(payload);
      const headers = JSON.parse(headersJson);

      if (!event || !event.event_type) {
        throw new Error('Invalid webhook payload');
      }

      // Verify webhook signature
      await this.verifyWebhookSignature(event, headers);

      console.log(`PayPal webhook event: ${event.event_type}`);

      // Handle different event types
      switch (event.event_type) {
        // One-time payment events
        case 'PAYMENT.CAPTURE.COMPLETED':
          await this.onPaymentCaptureCompleted(event);
          break;

        // Subscription events
        case 'BILLING.SUBSCRIPTION.ACTIVATED':
          await this.onSubscriptionActivated(event);
          break;

        case 'BILLING.SUBSCRIPTION.UPDATED':
          await this.onSubscriptionUpdated(event);
          break;

        case 'BILLING.SUBSCRIPTION.CANCELLED':
        case 'BILLING.SUBSCRIPTION.SUSPENDED':
        case 'BILLING.SUBSCRIPTION.EXPIRED':
          await this.onSubscriptionCancelled(event);
          break;

        // Subscription renewal payment
        case 'PAYMENT.SALE.COMPLETED':
          await this.onPaymentSaleCompleted(event);
          break;

        default:
          console.log(`Unhandled PayPal event type: ${event.event_type}`);
      }
    } catch (error) {
      console.error('PayPal webhook error:', error);
      throw error;
    }
  }

  // ============ Private Methods ============

  /**
   * Create one-time payment using Orders API v2
   */
  private async createOneTimePayment(params: {
    plan: any;
    price: any;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    scene: string;
  }): Promise<CheckoutResult> {
    const {
      plan,
      price,
      customerEmail,
      successUrl,
      cancelUrl,
      metadata,
      scene,
    } = params;

    const amount = (price.amount / 100).toFixed(2);
    const currency = price.currency.toUpperCase();

    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: randomUUID(),
          custom_id: JSON.stringify({ ...metadata, scene }),
          description: plan.name || 'Payment',
          amount: {
            currency_code: currency,
            value: amount,
            breakdown: {
              item_total: {
                currency_code: currency,
                value: amount,
              },
            },
          },
          items: [
            {
              name: plan.name || 'Payment',
              description: plan.description || '',
              unit_amount: {
                currency_code: currency,
                value: amount,
              },
              quantity: '1',
            },
          ],
        },
      ],
      application_context: {
        return_url: successUrl,
        cancel_url: cancelUrl,
        user_action: 'PAY_NOW',
        brand_name: defaultMessages.Metadata.name,
        shipping_preference: 'NO_SHIPPING',
      },
      payer: customerEmail
        ? {
            email_address: customerEmail,
          }
        : undefined,
    };

    // Use PayPal-Request-Id for idempotency
    const requestId = `order-${randomUUID()}`;
    const result = await this.makeRequest(
      '/v2/checkout/orders',
      'POST',
      orderPayload,
      {
        'PayPal-Request-Id': requestId,
      }
    );

    const approvalUrl = result.links?.find(
      (link: any) => link.rel === 'approve'
    )?.href;

    return {
      url: approvalUrl || '',
      id: result.id,
    };
  }

  /**
   * Create subscription payment (dynamically creates Product -> Plan -> Subscription)
   */
  private async createSubscriptionPayment(params: {
    plan: any;
    price: any;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<CheckoutResult> {
    const { plan, price, customerEmail, successUrl, cancelUrl, metadata } =
      params;

    // Step 1: Create a product
    const productPayload = {
      name: plan.name || 'Subscription',
      description: plan.description || 'Subscription Plan',
      type: 'SERVICE',
      category: 'SOFTWARE',
    };

    const productResult = await this.makeRequest(
      '/v1/catalogs/products',
      'POST',
      productPayload,
      {
        'PayPal-Request-Id': `product-${randomUUID()}`,
      }
    );

    // Step 2: Create a billing plan
    const amount = (price.amount / 100).toFixed(2);
    const currency = price.currency.toUpperCase();
    const intervalUnit = this.mapIntervalToPayPal(price.interval);

    const billingCycles: any[] = [];

    // Add trial period if specified
    if (price.trialPeriodDays && price.trialPeriodDays > 0) {
      billingCycles.push({
        frequency: {
          interval_unit: 'DAY',
          interval_count: 1,
        },
        tenure_type: 'TRIAL',
        sequence: 1,
        total_cycles: price.trialPeriodDays,
        pricing_scheme: {
          fixed_price: {
            value: '0.00',
            currency_code: currency,
          },
        },
      });
    }

    // Add regular billing cycle
    billingCycles.push({
      frequency: {
        interval_unit: intervalUnit,
        interval_count: 1,
      },
      tenure_type: 'REGULAR',
      sequence: billingCycles.length + 1,
      total_cycles: 0, // Infinite
      pricing_scheme: {
        fixed_price: {
          value: amount,
          currency_code: currency,
        },
      },
    });

    const planPayload = {
      product_id: productResult.id,
      name: plan.name || 'Subscription Plan',
      description: plan.description || 'Subscription',
      billing_cycles: billingCycles,
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3,
      },
    };

    const planResult = await this.makeRequest(
      '/v1/billing/plans',
      'POST',
      planPayload,
      {
        'PayPal-Request-Id': `plan-${randomUUID()}`,
      }
    );

    // Step 3: Create subscription
    const subscriptionPayload = {
      plan_id: planResult.id,
      custom_id: JSON.stringify(metadata),
      application_context: {
        brand_name: defaultMessages.Metadata.name,
        locale: 'en-US',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        payment_method: {
          payer_selected: 'PAYPAL',
          payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED',
        },
        return_url: successUrl,
        cancel_url: cancelUrl,
      },
      subscriber: customerEmail
        ? {
            email_address: customerEmail,
          }
        : undefined,
    };

    const subscriptionResult = await this.makeRequest(
      '/v1/billing/subscriptions',
      'POST',
      subscriptionPayload,
      { 'PayPal-Request-Id': `sub-${randomUUID()}` }
    );

    const approvalUrl = subscriptionResult.links?.find(
      (link: any) => link.rel === 'approve'
    )?.href;

    return {
      url: approvalUrl || '',
      id: subscriptionResult.id,
    };
  }

  /**
   * Capture an order (called after user approves payment)
   */
  public async captureOrder(orderId: string): Promise<any> {
    await this.ensureAccessToken();

    // Use orderId as PayPal-Request-Id to ensure idempotency on retry
    const result = await this.makeRequest(
      `/v2/checkout/orders/${orderId}/capture`,
      'POST',
      null,
      { 'PayPal-Request-Id': `capture-${orderId}` }
    );

    return result;
  }

  /**
   * Get order details (includes custom_id in purchase_units)
   */
  public async getOrderDetails(orderId: string): Promise<any> {
    await this.ensureAccessToken();
    return this.makeRequest(`/v2/checkout/orders/${orderId}`, 'GET');
  }

  /**
   * Get subscription details
   */
  public async getSubscription(subscriptionId: string): Promise<any> {
    await this.ensureAccessToken();
    return this.makeRequest(
      `/v1/billing/subscriptions/${subscriptionId}`,
      'GET'
    );
  }

  /**
   * Cancel subscription
   */
  public async cancelSubscription(
    subscriptionId: string,
    reason?: string
  ): Promise<void> {
    await this.ensureAccessToken();
    await this.makeRequest(
      `/v1/billing/subscriptions/${subscriptionId}/cancel`,
      'POST',
      { reason: reason || 'Customer requested cancellation' }
    );
  }

  // ============ Webhook Handlers ============

  /**
   * Handle PAYMENT.CAPTURE.COMPLETED event (one-time payment)
   */
  private async onPaymentCaptureCompleted(event: any): Promise<void> {
    console.log('>> Handle PayPal payment capture completed');

    const capture = event.resource;
    const orderId = capture.supplementary_data?.related_ids?.order_id;

    if (!orderId) {
      console.warn('<< No orderId found in capture event');
      return;
    }

    // Get order details for metadata
    const order = await this.makeRequest(
      `/v2/checkout/orders/${orderId}`,
      'GET'
    );
    const purchaseUnit = order.purchase_units?.[0];

    let metadata: any = {};
    if (purchaseUnit?.custom_id) {
      try {
        metadata = JSON.parse(purchaseUnit.custom_id);
      } catch {
        metadata = { custom_id: purchaseUnit.custom_id };
      }
    }

    const userId = metadata.userId;
    if (!userId) {
      console.error('<< No userId found in metadata');
      return;
    }

    // Verify amount matches
    const capturedAmount = Math.round(
      Number.parseFloat(capture.amount.value) * 100
    );
    const capturedCurrency = capture.amount.currency_code;

    // Find payment record by orderId
    const db = await getDb();
    const existingPayment = await db
      .select()
      .from(payment)
      .where(eq(payment.paypalOrderId, orderId))
      .limit(1);

    const currentDate = new Date();

    if (existingPayment.length > 0) {
      // Update existing payment record
      await db
        .update(payment)
        .set({
          status: 'completed',
          paid: true,
          updatedAt: currentDate,
        })
        .where(eq(payment.id, existingPayment[0].id));
    } else {
      // Create new payment record
      const priceId = metadata.priceId || '';
      const scene = metadata.scene || PaymentScenes.LIFETIME;

      await db.insert(payment).values({
        id: randomUUID(),
        priceId,
        type: PaymentTypes.ONE_TIME,
        scene,
        userId,
        customerId: order.payer?.payer_id || '',
        paypalOrderId: orderId,
        provider: 'paypal',
        paid: true,
        status: 'completed',
        createdAt: currentDate,
        updatedAt: currentDate,
      });
    }

    // Process benefits
    const scene = metadata.scene;
    if (scene === PaymentScenes.CREDIT) {
      await this.processCreditPurchase(metadata, capture.id);
    } else if (scene === PaymentScenes.LIFETIME) {
      await this.processLifetimePurchase(
        userId,
        metadata.priceId,
        capturedAmount,
        capture.id
      );
    }

    console.log('<< PayPal payment capture handled successfully');
  }

  /**
   * Handle BILLING.SUBSCRIPTION.ACTIVATED event
   */
  private async onSubscriptionActivated(event: any): Promise<void> {
    console.log('>> Handle PayPal subscription activated');

    const subscription = event.resource;
    const subscriptionId = subscription.id;

    let metadata: any = {};
    if (subscription.custom_id) {
      try {
        metadata = JSON.parse(subscription.custom_id);
      } catch {
        metadata = { custom_id: subscription.custom_id };
      }
    }

    const userId = metadata.userId;
    const priceId = metadata.priceId;

    if (!userId || !priceId) {
      console.error('<< Missing userId or priceId in subscription metadata');
      return;
    }

    const db = await getDb();
    const currentDate = new Date();

    // Get billing info for period dates
    const billingInfo = subscription.billing_info;
    const periodStart = new Date(
      subscription.start_time || subscription.create_time
    );
    const periodEnd = billingInfo?.next_billing_time
      ? new Date(billingInfo.next_billing_time)
      : this.calculatePeriodEnd(periodStart, metadata.interval);

    // Check if payment record already exists
    const existingPayment = await db
      .select()
      .from(payment)
      .where(eq(payment.paypalSubscriptionId, subscriptionId))
      .limit(1);

    if (existingPayment.length > 0) {
      // Update existing record
      await db
        .update(payment)
        .set({
          status: 'active',
          paid: true,
          periodStart,
          periodEnd,
          updatedAt: currentDate,
        })
        .where(eq(payment.id, existingPayment[0].id));
    } else {
      // Create new payment record
      await db.insert(payment).values({
        id: randomUUID(),
        priceId,
        type: PaymentTypes.SUBSCRIPTION,
        scene: PaymentScenes.SUBSCRIPTION,
        interval: metadata.interval || PlanIntervals.MONTH,
        userId,
        customerId: subscription.subscriber?.payer_id || '',
        paypalSubscriptionId: subscriptionId,
        provider: 'paypal',
        paid: true,
        status: 'active',
        periodStart,
        periodEnd,
        createdAt: currentDate,
        updatedAt: currentDate,
      });
    }

    // Add subscription credits
    if (websiteConfig.credits?.enableCredits) {
      await addSubscriptionCredits(userId, priceId);
      console.log('Added subscription credits for user:', userId);
    }

    try {
      await grantNanoFamilyEntitlementForSubscription({
        userId,
        priceId,
        startsAt: periodStart,
        expiresAt: periodEnd,
      });
    } catch (error) {
      console.error('Grant nano entitlement error:', error);
    }

    console.log('<< PayPal subscription activated successfully');
  }

  /**
   * Handle BILLING.SUBSCRIPTION.UPDATED event
   */
  private async onSubscriptionUpdated(event: any): Promise<void> {
    console.log('>> Handle PayPal subscription updated');

    const subscription = event.resource;
    const subscriptionId = subscription.id;

    const billingInfo = subscription.billing_info;
    const periodEnd = billingInfo?.next_billing_time
      ? new Date(billingInfo.next_billing_time)
      : undefined;

    const db = await getDb();
    await db
      .update(payment)
      .set({
        status: this.mapPayPalSubscriptionStatus(subscription.status),
        periodEnd,
        updatedAt: new Date(),
      })
      .where(eq(payment.paypalSubscriptionId, subscriptionId));

    console.log('<< PayPal subscription updated');
  }

  /**
   * Handle subscription cancellation events
   */
  private async onSubscriptionCancelled(event: any): Promise<void> {
    console.log('>> Handle PayPal subscription cancelled');

    const subscription = event.resource;
    const subscriptionId = subscription.id;

    const db = await getDb();
    await db
      .update(payment)
      .set({
        status: 'canceled',
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })
      .where(eq(payment.paypalSubscriptionId, subscriptionId));

    console.log('<< PayPal subscription cancelled');
  }

  /**
   * Handle PAYMENT.SALE.COMPLETED event (subscription renewal)
   */
  private async onPaymentSaleCompleted(event: any): Promise<void> {
    console.log('>> Handle PayPal subscription payment (renewal)');

    const sale = event.resource;
    const subscriptionId = sale.billing_agreement_id;

    if (!subscriptionId) {
      console.log('Not a subscription payment, skipping');
      return;
    }

    // Get subscription details
    const subscription = await this.getSubscription(subscriptionId);

    let metadata: any = {};
    if (subscription.custom_id) {
      try {
        metadata = JSON.parse(subscription.custom_id);
      } catch {
        metadata = { custom_id: subscription.custom_id };
      }
    }

    const userId = metadata.userId;
    const priceId = metadata.priceId;

    if (!userId || !priceId) {
      console.error('<< Missing userId or priceId');
      return;
    }

    // Update payment record with new period
    const db = await getDb();
    const billingInfo = subscription.billing_info;

    await db
      .update(payment)
      .set({
        status: 'active',
        paid: true,
        periodStart: new Date(sale.create_time),
        periodEnd: billingInfo?.next_billing_time
          ? new Date(billingInfo.next_billing_time)
          : undefined,
        updatedAt: new Date(),
      })
      .where(eq(payment.paypalSubscriptionId, subscriptionId));

    // Add renewal credits
    if (websiteConfig.credits?.enableCredits) {
      await addSubscriptionCredits(userId, priceId);
      console.log('Added renewal credits for user:', userId);
    }

    try {
      await grantNanoFamilyEntitlementForSubscription({
        userId,
        priceId,
        startsAt: new Date(sale.create_time),
        expiresAt: billingInfo?.next_billing_time
          ? new Date(billingInfo.next_billing_time)
          : new Date(sale.create_time),
      });
    } catch (error) {
      console.error('Grant nano entitlement error:', error);
    }

    console.log('<< PayPal subscription renewal handled');
  }

  // ============ Helper Methods ============

  /**
   * Process credit package purchase
   */
  private async processCreditPurchase(
    metadata: any,
    invoiceId: string
  ): Promise<void> {
    const packageId = metadata.packageId;
    const userId = metadata.userId;

    if (!packageId || !userId) {
      console.warn('Missing packageId or userId for credit purchase');
      return;
    }

    const creditPackage = getCreditPackageById(packageId);
    if (!creditPackage) {
      console.warn('Credit package not found:', packageId);
      return;
    }

    await addCredits({
      userId,
      amount: creditPackage.amount,
      type: CREDIT_TRANSACTION_TYPE.PURCHASE_PACKAGE,
      description: `+${creditPackage.amount} credits for package ${packageId}`,
      paymentId: invoiceId,
      expireDays: creditPackage.expireDays,
    });

    trackServerEvent('credit_purchase_completed', {
      userId,
      provider: 'paypal',
      packageId,
      credits: creditPackage.amount,
      amount: creditPackage.price.amount / 100,
      currency: creditPackage.price.currency,
      invoiceId,
    });

    console.log('Added credits for user:', userId);
  }

  /**
   * Process lifetime plan purchase
   */
  private async processLifetimePurchase(
    userId: string,
    priceId: string,
    amount: number,
    invoiceId: string
  ): Promise<void> {
    if (websiteConfig.credits?.enableCredits) {
      await addLifetimeMonthlyCredits(userId, priceId);
      console.log('Added lifetime credits for user:', userId);
    }

    // Find customerId for notification
    const db = await getDb();
    const userRecord = await db
      .select({ customerId: user.customerId })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const customerId = userRecord[0]?.customerId || '';
    await sendNotification(invoiceId, customerId, userId, amount / 100);
  }

  /**
   * Verify webhook signature
   */
  private async verifyWebhookSignature(
    event: any,
    headers: any
  ): Promise<void> {
    if (!this.webhookId) {
      console.warn('PAYPAL_WEBHOOK_ID not configured, skipping verification');
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Webhook verification required in production');
      }
      return;
    }

    // Check if signature headers are present
    const authAlgo = headers['paypal-auth-algo'];
    const certUrl = headers['paypal-cert-url'];
    const transmissionId = headers['paypal-transmission-id'];
    const transmissionSig = headers['paypal-transmission-sig'];
    const transmissionTime = headers['paypal-transmission-time'];

    const hasSignatureHeaders = !!(
      authAlgo &&
      transmissionId &&
      transmissionSig &&
      transmissionTime
    );

    if (!hasSignatureHeaders) {
      // No signature headers - simulated/test event
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing webhook signature headers in production');
      }
      console.warn(
        'No signature headers present (simulated event), skipping verification'
      );
      return;
    }

    // Verify with PayPal
    const verifyPayload = {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: this.webhookId,
      webhook_event: event,
    };

    const verifyResponse = await this.makeRequest(
      '/v1/notifications/verify-webhook-signature',
      'POST',
      verifyPayload
    );

    if (verifyResponse.verification_status !== 'SUCCESS') {
      // Production: always reject
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Webhook verification failed in production');
      }

      // Non-production: check explicit bypass flag
      const allowUnverified =
        process.env.ALLOW_UNVERIFIED_PAYPAL_WEBHOOKS === 'true';
      if (!allowUnverified) {
        throw new Error(
          'Webhook verification failed. Set ALLOW_UNVERIFIED_PAYPAL_WEBHOOKS=true to bypass in development'
        );
      }

      console.warn(
        'Webhook verification failed but ALLOW_UNVERIFIED_PAYPAL_WEBHOOKS is enabled'
      );
    }
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return;
    }

    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET!;

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64'
    );

    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(
        `PayPal authentication failed: ${data.error_description}`
      );
    }

    this.accessToken = data.access_token;
    // Set expiry 5 minutes before actual expiry for safety
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  }

  /**
   * Make authenticated request to PayPal API
   */
  private async makeRequest(
    endpoint: string,
    method: string,
    data?: any,
    additionalHeaders?: Record<string, string>
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      ...additionalHeaders,
    };

    const config: RequestInit = {
      method,
      headers,
    };

    if (data) {
      config.body = JSON.stringify(data);
    }

    const response = await fetch(url, config);

    // Handle empty response (204 No Content)
    if (response.status === 204) {
      return {};
    }

    if (!response.ok) {
      const result = await response.json();
      let errorMessage = result.name || result.error || 'Unknown error';
      if (result.details) {
        errorMessage += `: ${result.details
          .map((detail: any) => detail.issue || detail.description)
          .join(', ')}`;
      }
      if (result.message) {
        errorMessage += `: ${result.message}`;
      }
      throw new Error(`PayPal request failed: ${errorMessage}`);
    }

    return await response.json();
  }

  /**
   * Map our interval to PayPal interval format
   */
  private mapIntervalToPayPal(interval?: PlanInterval): string {
    switch (interval) {
      case PlanIntervals.MONTH:
        return 'MONTH';
      case PlanIntervals.YEAR:
        return 'YEAR';
      default:
        return 'MONTH';
    }
  }

  /**
   * Map PayPal subscription status to payment status
   */
  private mapPayPalSubscriptionStatus(status: string): PaymentStatus {
    switch (status) {
      case 'ACTIVE':
        return 'active';
      case 'APPROVAL_PENDING':
      case 'APPROVED':
        return 'processing';
      case 'CANCELLED':
        return 'canceled';
      case 'SUSPENDED':
        return 'paused';
      case 'EXPIRED':
        return 'incomplete_expired';
      default:
        return 'active';
    }
  }

  /**
   * Calculate period end date based on interval
   */
  private calculatePeriodEnd(startDate: Date, interval?: string): Date {
    const endDate = new Date(startDate);
    switch (interval) {
      case 'year':
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
      default:
        endDate.setMonth(endDate.getMonth() + 1);
        break;
    }
    return endDate;
  }
}
