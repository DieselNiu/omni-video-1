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

type JsonRecord = Record<string, unknown>;

type NowPaymentsCheckoutPrice = {
  amount: number;
  currency: string;
  interval?: PlanInterval;
};

type NowPaymentsInvoiceResponse = {
  id?: string | number;
  invoice_id?: string | number;
  invoice_url?: string;
};

type NowPaymentsIpnPayload = {
  payment_id?: string | number;
  invoice_id?: string | number;
  order_id?: string;
  payment_status?: string;
  price_amount?: number;
  actually_paid?: number;
  pay_amount?: number;
  price_currency?: string;
};

const NOWPAYMENTS_FINISHED_STATUS = 'finished';
const NOWPAYMENTS_FAILED_STATUSES = new Set(['failed', 'expired', 'refunded']);

/**
 * NOWPayments hosted invoice provider.
 *
 * NOWPayments invoices are one-time crypto payments. For monthly/yearly plans
 * we still create one invoice, then record an active subscription period in our
 * database so the existing entitlement checks keep working without auto-renewal.
 */
export class NowPaymentsProvider implements PaymentProvider {
  private apiKey: string;
  private ipnSecret: string;
  private baseUrl: string;

  constructor() {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) {
      throw new Error('NOWPAYMENTS_API_KEY environment variable is not set');
    }

    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
    if (!ipnSecret) {
      throw new Error('NOWPAYMENTS_IPN_SECRET environment variable is not set');
    }

    this.apiKey = apiKey;
    this.ipnSecret = ipnSecret;
    this.baseUrl =
      process.env.NOWPAYMENTS_API_BASE_URL ?? 'https://api.nowpayments.io/v1';
  }

  public async createCheckout(
    params: CreateCheckoutParams
  ): Promise<CheckoutResult> {
    const { planId, priceId, customerEmail, successUrl, cancelUrl, metadata } =
      params;

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

    return this.createInvoiceCheckout({
      amount: price.amount,
      currency: price.currency,
      customerEmail,
      successUrl,
      cancelUrl,
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
    const { packageId, customerEmail, successUrl, cancelUrl, metadata } =
      params;

    const creditPackage = getCreditPackageById(packageId);
    if (!creditPackage) {
      throw new Error(`Credit package with ID ${packageId} not found`);
    }

    return this.createInvoiceCheckout({
      amount: creditPackage.price.amount,
      currency: creditPackage.price.currency,
      customerEmail,
      successUrl,
      cancelUrl,
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
    return { url: 'https://account.nowpayments.io/dashboard' };
  }

  public async handleWebhookEvent(
    payload: string,
    signature: string
  ): Promise<void> {
    if (!payload) {
      throw new Error('Missing NOWPayments webhook payload');
    }
    if (!signature) {
      throw new Error('Missing NOWPayments webhook signature');
    }

    this.verifyIpnSignature(payload, signature);

    const event = JSON.parse(payload) as NowPaymentsIpnPayload;
    const orderId = event.order_id;
    if (!orderId) {
      throw new Error('NOWPayments IPN missing order_id');
    }

    const db = await getDb();
    const existing = await db
      .select()
      .from(payment)
      .where(
        or(
          eq(payment.id, orderId),
          eq(payment.sessionId, orderId),
          event.invoice_id
            ? eq(payment.invoiceId, String(event.invoice_id))
            : eq(payment.id, orderId)
        )
      )
      .limit(1);

    const paymentRecord = existing[0];
    if (!paymentRecord) {
      throw new Error(`NOWPayments payment record not found: ${orderId}`);
    }

    const status = event.payment_status || 'processing';
    const mappedStatus = this.mapPaymentStatus(status, paymentRecord.scene);

    if (status !== NOWPAYMENTS_FINISHED_STATUS) {
      await db
        .update(payment)
        .set({
          status: mappedStatus,
          updatedAt: new Date(),
        })
        .where(eq(payment.id, paymentRecord.id));
      return;
    }

    if (paymentRecord.paid) {
      return;
    }

    await this.grantBenefits(paymentRecord, event);

    await db
      .update(payment)
      .set({
        status: mappedStatus,
        paid: true,
        updatedAt: new Date(),
      })
      .where(eq(payment.id, paymentRecord.id));
  }

  private async createInvoiceCheckout(params: {
    amount: number;
    currency: string;
    customerEmail: string;
    successUrl?: string;
    cancelUrl?: string;
    description: string;
    metadata: Record<string, string | undefined>;
    price: NowPaymentsCheckoutPrice;
    scene: PaymentScenes;
  }): Promise<CheckoutResult> {
    const paymentId = randomUUID();
    const userId = params.metadata.userId;
    if (!userId) {
      throw new Error('Missing userId for NOWPayments checkout');
    }

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
      id: paymentId,
      priceId: params.metadata.priceId || '',
      type,
      scene: params.scene,
      interval:
        params.scene === PaymentScenes.SUBSCRIPTION
          ? params.price.interval || PlanIntervals.MONTH
          : null,
      userId,
      customerId: params.customerEmail || userId,
      sessionId: paymentId,
      provider: 'nowpayments',
      paid: false,
      status: 'processing',
      periodStart:
        params.scene === PaymentScenes.SUBSCRIPTION ? periodStart : null,
      periodEnd: periodEnd ?? null,
      createdAt: periodStart,
      updatedAt: periodStart,
    });

    const successUrl = this.replaceCheckoutSessionPlaceholder(
      params.successUrl,
      paymentId
    );
    const cancelUrl = this.replaceCheckoutSessionPlaceholder(
      params.cancelUrl,
      paymentId
    );

    const invoice = await this.createInvoice({
      price_amount: params.amount / 100,
      price_currency: params.currency.toLowerCase(),
      order_id: paymentId,
      order_description: params.description,
      success_url: successUrl,
      cancel_url: cancelUrl,
      ipn_callback_url: this.getIpnCallbackUrl(),
    });

    const invoiceId = String(invoice.id ?? invoice.invoice_id ?? '');
    const invoiceUrl = invoice.invoice_url;
    if (!invoiceId || !invoiceUrl) {
      throw new Error('NOWPayments invoice response missing invoice URL');
    }

    await db
      .update(payment)
      .set({
        invoiceId,
        updatedAt: new Date(),
      })
      .where(eq(payment.id, paymentId));

    return {
      id: paymentId,
      url: invoiceUrl,
    };
  }

  private async createInvoice(
    body: JsonRecord
  ): Promise<NowPaymentsInvoiceResponse> {
    const response = await fetch(`${this.baseUrl}/invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NOWPayments invoice failed: ${errorText}`);
    }

    return (await response.json()) as NowPaymentsInvoiceResponse;
  }

  private async grantBenefits(
    paymentRecord: typeof payment.$inferSelect,
    event: NowPaymentsIpnPayload
  ): Promise<void> {
    const providerPaymentId = String(
      event.payment_id ?? event.invoice_id ?? paymentRecord.id
    );

    if (paymentRecord.scene === PaymentScenes.CREDIT) {
      const packageId = this.findPackageIdByPriceId(paymentRecord.priceId);
      if (!packageId) {
        console.warn(
          'NOWPayments credit package not found:',
          paymentRecord.priceId
        );
        return;
      }

      const creditPackage = getCreditPackageById(packageId);
      if (!creditPackage) {
        console.warn('NOWPayments credit package config missing:', packageId);
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
        Number(
          event.price_amount ?? event.actually_paid ?? event.pay_amount ?? 0
        )
      );
    } catch (error) {
      console.error('NOWPayments purchase notification error:', error);
    }
  }

  private verifyIpnSignature(payload: string, signature: string): void {
    const parsed = JSON.parse(payload) as JsonRecord;
    const sortedPayload = JSON.stringify(this.sortObject(parsed));
    const expected = crypto
      .createHmac('sha512', this.ipnSecret)
      .update(sortedPayload)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'hex');
    const signatureBuffer = Buffer.from(signature, 'hex');
    if (
      expectedBuffer.length !== signatureBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      throw new Error('Invalid NOWPayments webhook signature');
    }
  }

  private sortObject(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortObject(item));
    }

    if (value && typeof value === 'object') {
      return Object.keys(value as JsonRecord)
        .sort()
        .reduce<JsonRecord>((acc, key) => {
          acc[key] = this.sortObject((value as JsonRecord)[key]);
          return acc;
        }, {});
    }

    return value;
  }

  private mapPaymentStatus(
    status: string,
    scene: string | null
  ): PaymentStatus {
    if (status === NOWPAYMENTS_FINISHED_STATUS) {
      if (scene === PaymentScenes.SUBSCRIPTION) {
        return 'active';
      }
      return 'completed';
    }
    if (NOWPAYMENTS_FAILED_STATUSES.has(status)) {
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

  private replaceCheckoutSessionPlaceholder(
    url: string | undefined,
    paymentId: string
  ): string {
    return (url || '').replace('{CHECKOUT_SESSION_ID}', paymentId);
  }

  private getIpnCallbackUrl(): string {
    const configuredUrl = process.env.NOWPAYMENTS_IPN_CALLBACK_URL;
    if (configuredUrl) {
      return configuredUrl;
    }

    const appUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_WEB_URL;
    if (!appUrl) {
      throw new Error(
        'NOWPAYMENTS_IPN_CALLBACK_URL or NEXT_PUBLIC_BASE_URL is required'
      );
    }

    return `${appUrl.replace(/\/$/, '')}/api/webhooks/nowpayments/`;
  }

  private findPackageIdByPriceId(priceId: string): string | undefined {
    return Object.values(websiteConfig.credits.packages).find(
      (pkg) => pkg.price.priceId === priceId
    )?.id;
  }
}
