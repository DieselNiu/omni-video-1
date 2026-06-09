import crypto, { randomUUID } from 'crypto';
import { websiteConfig } from '@/config/website';
import {
  addCredits,
  addLifetimeMonthlyCredits,
  addSubscriptionCredits,
} from '@/credits/credits';
import { getCreditPackageById } from '@/credits/server';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { grantNanoFamilyEntitlementForSubscription } from '@/lib/entitlements/entitlements';
import { findPlanByPlanId, findPriceInPlan } from '@/lib/price-plan';
import { sendNotification } from '@/notification/notification';
import { eq, or } from 'drizzle-orm';
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

type PayssionCheckoutPrice = {
  amount: number;
  currency: string;
  interval?: PlanInterval;
};

type PayssionCreateResponse = {
  redirect_url?: string;
  transaction?: {
    transaction_id?: string;
    state?: string;
    pm_id?: string;
    order_id?: string;
  };
  result_code?: number;
  description?: string;
};

/**
 * Payssion async notification (notify_url) payload.
 * @see https://payssion.com/cn/docs/ (Notifications)
 */
type PayssionNotifyPayload = {
  app_name?: string;
  pm_id?: string;
  transaction_id?: string;
  order_id?: string;
  amount?: string;
  paid?: string;
  net?: string | number;
  fee?: string;
  currency?: string;
  description?: string;
  state?: string;
  notify_sig?: string;
};

const PAYSSION_SUCCESS_STATE = 'completed';
const PAYSSION_FAILED_STATES = new Set([
  'failed',
  'cancelled',
  'expired',
  'rejected',
  'error',
]);

/**
 * Default Russian payment method when the caller does not specify one.
 */
const DEFAULT_PM_ID = 'sberpay_ru';

/**
 * Payssion classic (V1) hosted-payment provider.
 *
 * Payssion V1 payments are one-time hosted charges. For monthly/yearly plans we
 * still create a single payment, then record an active subscription period in
 * our database so the existing entitlement checks keep working without
 * auto-renewal — mirrors {@link NowPaymentsProvider}.
 */
export class PayssionProvider implements PaymentProvider {
  private apiKey: string;
  private secretKey: string;
  private baseUrl: string;

  constructor() {
    const apiKey = process.env.PAYSSION_API_KEY;
    if (!apiKey) {
      throw new Error('PAYSSION_API_KEY environment variable is not set');
    }

    const secretKey = process.env.PAYSSION_SECRET_KEY;
    if (!secretKey) {
      throw new Error('PAYSSION_SECRET_KEY environment variable is not set');
    }

    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.baseUrl =
      process.env.PAYSSION_API_BASE_URL ?? 'https://www.payssion.com/api/v1';
  }

  public async createCheckout(
    params: CreateCheckoutParams
  ): Promise<CheckoutResult> {
    const { planId, priceId, customerEmail, metadata } = params;

    const plan = findPlanByPlanId(planId);
    if (!plan) {
      throw new Error(`Plan with ID ${planId} not found`);
    }

    const price = findPriceInPlan(planId, priceId);
    if (!price) {
      throw new Error(`Price ID ${priceId} not found in plan ${planId}`);
    }

    const scene = plan.isLifetime
      ? PaymentScenes.LIFETIME
      : PaymentScenes.SUBSCRIPTION;

    return this.createHostedPayment({
      amount: price.amount,
      currency: price.currency,
      customerEmail,
      description: plan.name || planId,
      metadata: {
        ...metadata,
        planId,
        priceId,
        scene,
        interval: price.interval || '',
      },
      price,
      scene,
    });
  }

  public async createCreditCheckout(
    params: CreateCreditCheckoutParams
  ): Promise<CheckoutResult> {
    const { packageId, customerEmail, metadata } = params;

    const creditPackage = getCreditPackageById(packageId);
    if (!creditPackage) {
      throw new Error(`Credit package with ID ${packageId} not found`);
    }

    return this.createHostedPayment({
      amount: creditPackage.price.amount,
      currency: creditPackage.price.currency,
      customerEmail,
      description: `${creditPackage.amount} Credits`,
      metadata: {
        ...metadata,
        type: 'credit_purchase',
        packageId,
        priceId: creditPackage.price.priceId,
        credits: String(creditPackage.amount),
        scene: PaymentScenes.CREDIT,
      },
      price: creditPackage.price,
      scene: PaymentScenes.CREDIT,
    });
  }

  public async createCustomerPortal(
    _params: CreatePortalParams
  ): Promise<PortalResult> {
    // Payssion V1 is one-time only; there is no self-service portal.
    return { url: 'https://www.payssion.com/' };
  }

  public async handleWebhookEvent(
    payload: string,
    _signature: string
  ): Promise<void> {
    if (!payload) {
      throw new Error('Missing Payssion webhook payload');
    }

    const event = this.parseNotifyPayload(payload);

    // Signature lives inside the notification body (notify_sig), not a header.
    this.verifyNotifySignature(event);

    const orderId = event.order_id;
    if (!orderId) {
      throw new Error('Payssion notification missing order_id');
    }

    const db = await getDb();
    const transactionId = event.transaction_id;
    const existing = await db
      .select()
      .from(payment)
      .where(
        or(
          eq(payment.id, orderId),
          eq(payment.sessionId, orderId),
          transactionId
            ? eq(payment.invoiceId, transactionId)
            : eq(payment.id, orderId)
        )
      )
      .limit(1);

    const paymentRecord = existing[0];
    if (!paymentRecord) {
      throw new Error(`Payssion payment record not found: ${orderId}`);
    }

    const state = event.state || 'pending';
    const mappedStatus = this.mapPaymentStatus(state, paymentRecord.scene);

    if (state !== PAYSSION_SUCCESS_STATE) {
      await db
        .update(payment)
        .set({
          status: mappedStatus,
          invoiceId: transactionId ?? paymentRecord.invoiceId,
          updatedAt: new Date(),
        })
        .where(eq(payment.id, paymentRecord.id));
      return;
    }

    // Idempotency: skip if already granted.
    if (paymentRecord.paid) {
      return;
    }

    await this.grantBenefits(paymentRecord, event);

    await db
      .update(payment)
      .set({
        status: mappedStatus,
        paid: true,
        invoiceId: transactionId ?? paymentRecord.invoiceId,
        updatedAt: new Date(),
      })
      .where(eq(payment.id, paymentRecord.id));
  }

  private async createHostedPayment(params: {
    amount: number;
    currency: string;
    customerEmail: string;
    description: string;
    metadata: Record<string, string | undefined>;
    price: PayssionCheckoutPrice;
    scene: PaymentScenes;
  }): Promise<CheckoutResult> {
    const orderId = randomUUID();
    const userId = params.metadata.userId;
    if (!userId) {
      throw new Error('Missing userId for Payssion checkout');
    }

    const pmId = params.metadata.pm_id || DEFAULT_PM_ID;
    const amount = this.formatAmount(params.amount);
    const currency = params.currency.toUpperCase();

    const type =
      params.scene === PaymentScenes.SUBSCRIPTION
        ? PaymentTypes.SUBSCRIPTION
        : PaymentTypes.ONE_TIME;
    const periodStart = new Date();
    const periodEnd =
      params.scene === PaymentScenes.SUBSCRIPTION
        ? this.calculatePeriodEnd(periodStart, params.price.interval)
        : undefined;

    const db = await getDb();
    await db.insert(payment).values({
      id: orderId,
      priceId: params.metadata.priceId || '',
      type,
      scene: params.scene,
      interval:
        params.scene === PaymentScenes.SUBSCRIPTION
          ? params.price.interval || PlanIntervals.MONTH
          : null,
      userId,
      customerId: params.customerEmail || userId,
      sessionId: orderId,
      provider: 'payssion',
      paid: false,
      status: 'processing',
      periodStart:
        params.scene === PaymentScenes.SUBSCRIPTION ? periodStart : null,
      periodEnd: periodEnd ?? null,
      createdAt: periodStart,
      updatedAt: periodStart,
    });

    const requestBody = {
      api_key: this.apiKey,
      pm_id: pmId,
      amount,
      currency,
      description: params.description.slice(0, 255),
      order_id: orderId,
      api_sig: this.createSignature(pmId, amount, currency, orderId),
      notify_url: this.getNotifyUrl(),
      payer_email: params.customerEmail || undefined,
    };

    const response = await this.postForm('/payments', requestBody);

    if (response.result_code !== 200 || !response.redirect_url) {
      const reason =
        response.description || `result_code=${response.result_code}`;
      throw new Error(`Payssion payment create failed: ${reason}`);
    }

    const transactionId = response.transaction?.transaction_id;
    if (transactionId) {
      await db
        .update(payment)
        .set({
          invoiceId: transactionId,
          updatedAt: new Date(),
        })
        .where(eq(payment.id, orderId));
    }

    return {
      id: orderId,
      url: response.redirect_url,
    };
  }

  /**
   * Payssion V1 accepts both form-urlencoded and JSON. We send JSON so the
   * async notification also arrives as JSON (the notify Content-Type mirrors
   * the create request).
   */
  private async postForm(
    path: string,
    body: Record<string, string | undefined>
  ): Promise<PayssionCreateResponse> {
    const cleaned = Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined)
    );

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(cleaned),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Payssion request failed (${response.status}): ${errorText}`
      );
    }

    return (await response.json()) as PayssionCreateResponse;
  }

  private async grantBenefits(
    paymentRecord: typeof payment.$inferSelect,
    event: PayssionNotifyPayload
  ): Promise<void> {
    const providerPaymentId = String(
      event.transaction_id ?? paymentRecord.invoiceId ?? paymentRecord.id
    );

    if (paymentRecord.scene === PaymentScenes.CREDIT) {
      const packageId = this.findPackageIdByPriceId(paymentRecord.priceId);
      if (!packageId) {
        console.warn(
          'Payssion credit package not found:',
          paymentRecord.priceId
        );
        return;
      }

      const creditPackage = getCreditPackageById(packageId);
      if (!creditPackage) {
        console.warn('Payssion credit package config missing:', packageId);
        return;
      }

      await addCredits({
        userId: paymentRecord.userId,
        amount: creditPackage.amount,
        type: CREDIT_TRANSACTION_TYPE.PURCHASE_PACKAGE,
        description: `+${creditPackage.amount} credits for package ${packageId}`,
        paymentId: providerPaymentId,
        expireDays: creditPackage.expireDays,
      });
    } else if (paymentRecord.scene === PaymentScenes.SUBSCRIPTION) {
      if (websiteConfig.credits?.enableCredits) {
        await addSubscriptionCredits(
          paymentRecord.userId,
          paymentRecord.priceId
        );
      }

      try {
        await grantNanoFamilyEntitlementForSubscription({
          userId: paymentRecord.userId,
          priceId: paymentRecord.priceId,
          startsAt: paymentRecord.periodStart || new Date(),
          expiresAt: paymentRecord.periodEnd || new Date(),
        });
      } catch (error) {
        console.error('Grant nano entitlement error:', error);
      }
    } else if (paymentRecord.scene === PaymentScenes.LIFETIME) {
      if (websiteConfig.credits?.enableCredits) {
        await addLifetimeMonthlyCredits(
          paymentRecord.userId,
          paymentRecord.priceId
        );
      }
    }

    try {
      await sendNotification(
        providerPaymentId,
        paymentRecord.customerId,
        paymentRecord.userId,
        Number(event.amount ?? event.paid ?? 0)
      );
    } catch (error) {
      console.error('Payssion purchase notification error:', error);
    }
  }

  /**
   * Create-payment signature (Direct API):
   * md5(api_key|pm_id|amount|currency|order_id|secret_key)
   */
  private createSignature(
    pmId: string,
    amount: string,
    currency: string,
    orderId: string
  ): string {
    const msg = [
      this.apiKey,
      pmId,
      amount,
      currency,
      orderId,
      this.secretKey,
    ].join('|');
    return crypto.createHash('md5').update(msg).digest('hex');
  }

  /**
   * Async notification signature:
   * md5(api_key|pm_id|amount|currency|order_id|state|secret_key)
   */
  private verifyNotifySignature(event: PayssionNotifyPayload): void {
    const provided = event.notify_sig;
    if (!provided) {
      throw new Error('Payssion notification missing notify_sig');
    }

    const msg = [
      this.apiKey,
      event.pm_id ?? '',
      event.amount ?? '',
      event.currency ?? '',
      event.order_id ?? '',
      event.state ?? '',
      this.secretKey,
    ].join('|');
    const expected = crypto.createHash('md5').update(msg).digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(provided.toLowerCase(), 'utf8');
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new Error('Invalid Payssion notification signature');
    }
  }

  private parseNotifyPayload(payload: string): PayssionNotifyPayload {
    const trimmed = payload.trim();
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed) as PayssionNotifyPayload;
    }

    // Fallback: form-urlencoded notification.
    const params = new URLSearchParams(trimmed);
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result as PayssionNotifyPayload;
  }

  private mapPaymentStatus(state: string, scene: string | null): PaymentStatus {
    if (state === PAYSSION_SUCCESS_STATE) {
      if (scene === PaymentScenes.SUBSCRIPTION) {
        return 'active';
      }
      return 'completed';
    }
    if (PAYSSION_FAILED_STATES.has(state)) {
      return 'failed';
    }
    return 'processing';
  }

  private calculatePeriodEnd(start: Date, interval?: PlanInterval): Date {
    const end = new Date(start);
    if (interval === PlanIntervals.YEAR) {
      end.setFullYear(end.getFullYear() + 1);
      return end;
    }

    end.setMonth(end.getMonth() + 1);
    return end;
  }

  /**
   * Convert an amount in minor units (cents) to a fixed 2-decimal string, e.g.
   * 2990 -> "29.90". The same string must be used in the request and signature.
   */
  private formatAmount(amountInCents: number): string {
    return (amountInCents / 100).toFixed(2);
  }

  /**
   * Build the per-transaction notify_url. Returns undefined when no public URL
   * is available (e.g. localhost / private IP during local dev) so we omit the
   * param entirely — Payssion then falls back to the app's dashboard-configured
   * Notify URL. Payssion rejects local/private notify_url values outright.
   */
  private getNotifyUrl(): string | undefined {
    const configuredUrl = process.env.PAYSSION_NOTIFY_URL;
    if (configuredUrl) {
      return this.isPublicUrl(configuredUrl) ? configuredUrl : undefined;
    }

    const appUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_WEB_URL;
    if (!appUrl) {
      return undefined;
    }

    // Trailing slash matters: next.config has trailingSlash:true, so the
    // slashless path 308-redirects and Payssion's webhook sender may not follow.
    const notifyUrl = `${appUrl.replace(/\/$/, '')}/api/webhooks/payssion/`;
    return this.isPublicUrl(notifyUrl) ? notifyUrl : undefined;
  }

  /**
   * Payssion only accepts publicly reachable HTTP(S) notify URLs. Treat
   * localhost, *.local, and private/loopback IPv4 ranges as non-public.
   */
  private isPublicUrl(url: string): boolean {
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return false;
    }

    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.localhost')
    ) {
      return false;
    }

    // Private / loopback IPv4 ranges.
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
      return false;
    }
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
      return false;
    }

    return true;
  }

  private findPackageIdByPriceId(priceId: string): string | undefined {
    return Object.values(websiteConfig.credits.packages).find(
      (pkg) => pkg.price.priceId === priceId
    )?.id;
  }
}
