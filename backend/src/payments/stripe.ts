import { createHmac, timingSafeEqual } from 'crypto';
import { secret } from '../common/secrets';
import { appUrl } from '../common/urls';

export const STRIPE_CONFIG = Symbol('STRIPE_CONFIG');
/** Toate prețurile sunt în lei. Stripe cere cel puțin 2,00 lei pentru o plată în RON. */
export const CURRENCY = 'RON';
export const MIN_PRICE_CENTS = 200;
export const MAX_PRICE_CENTS = 1_000_000;

export interface StripeConfig {
  /** Activ doar cu ambele chei (STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET). Fără ele, evenimentele sunt doar gratuite. */
  enabled: boolean;
  secretKey: string;
  webhookSecret: string;
  apiUrl: string;
  appUrl: string;
}

export function stripeConfig(env: NodeJS.ProcessEnv = process.env): StripeConfig {
  const secretKey = secret('STRIPE_SECRET_KEY', false, env) ?? '';
  const webhookSecret = secret('STRIPE_WEBHOOK_SECRET', false, env) ?? '';
  return {
    enabled: !!secretKey && !!webhookSecret,
    secretKey,
    webhookSecret,
    apiUrl: (env.STRIPE_API_URL?.trim() || 'https://api.stripe.com').replace(/\/+$/, ''), // altul doar în teste
    appUrl: appUrl(env),
  };
}

/** „49,90 lei” */
export const priceLabel = (cents: number) =>
  `${(cents / 100).toLocaleString('ro-RO', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })} lei`;

export interface CheckoutSession { id: string; url: string; expiresAt: Date }

/** Eroare Stripe: `transient` = rețea / 5xx / 429 (se reîncearcă); altfel cererea e greșită (ex. plată deja returnată). */
export class StripeError extends Error {
  constructor(message: string, public readonly transient: boolean, public readonly code?: string) {
    super(message);
  }
}

export abstract class StripeClient {
  abstract createCheckout(p: {
    paymentId: string; eventId: string; title: string; amountCents: number; email: string; expiresAt: Date;
  }): Promise<CheckoutSession>;
  abstract refund(paymentIntentId: string, paymentId: string): Promise<void>;
}

/** Stripe prin HTTP direct (form-encoded, ca API-ul lor): două cereri, fără SDK. Cheile de idempotență evită dublurile. */
export class HttpStripeClient extends StripeClient {
  constructor(private readonly cfg: StripeConfig) {
    super();
  }

  private async post(path: string, form: Record<string, string>, idempotencyKey: string) {
    let res: Response;
    try {
      res = await fetch(`${this.cfg.apiUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.cfg.secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': idempotencyKey,
          'Stripe-Version': '2024-06-20',
        },
        body: new URLSearchParams(form),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new StripeError(`Stripe nu răspunde: ${e instanceof Error ? e.message : e}`, true);
    }
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } } & Record<string, unknown>;
    if (!res.ok) throw new StripeError(body.error?.message ?? `Stripe ${res.status}`, res.status >= 500 || res.status === 429, body.error?.code);
    return body;
  }

  async createCheckout(p: Parameters<StripeClient['createCheckout']>[0]): Promise<CheckoutSession> {
    const eventUrl = `${this.cfg.appUrl}/events/${p.eventId}`;
    const s = await this.post('/v1/checkout/sessions', {
      mode: 'payment',
      locale: 'ro',
      customer_email: p.email,
      client_reference_id: p.paymentId,
      'metadata[paymentId]': p.paymentId,
      'payment_intent_data[metadata][paymentId]': p.paymentId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': CURRENCY.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(p.amountCents),
      'line_items[0][price_data][product_data][name]': p.title.slice(0, 250),
      expires_at: String(Math.floor(p.expiresAt.getTime() / 1000)),
      success_url: `${eventUrl}?plata=succes`,
      cancel_url: `${eventUrl}?plata=anulata`,
    }, `checkout-${p.paymentId}`);
    if (typeof s.id !== 'string' || typeof s.url !== 'string') throw new StripeError('Răspuns Stripe neașteptat', true);
    return { id: s.id, url: s.url, expiresAt: new Date(Number(s.expires_at) * 1000) };
  }

  async refund(paymentIntentId: string, paymentId: string) {
    await this.post('/v1/refunds', { payment_intent: paymentIntentId, 'metadata[paymentId]': paymentId }, `refund-${paymentId}`);
  }
}

/**
 * Verifică semnătura unui webhook Stripe (antetul `Stripe-Signature: t=…,v1=…`): HMAC-SHA256 cu secretul webhook-ului
 * peste `t.corp`, pe corpul **brut** (exact octeții primiți). Cel mult 5 minute vechime: un webhook capturat nu se poate retrimite.
 */
export function verifyStripeSignature(rawBody: Buffer, header: string | undefined, webhookSecret: string, now = Date.now(), toleranceSec = 300): boolean {
  if (!header || !webhookSecret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!Number.isFinite(t) || !signatures.length || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = createHmac('sha256', webhookSecret).update(`${t}.`).update(rawBody).digest();
  return signatures.some((s) => {
    const got = Buffer.from(s, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

/** Pentru teste: semnătura pe care ar pune-o Stripe. */
export function signStripePayload(payload: string, webhookSecret: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac('sha256', webhookSecret).update(`${t}.${payload}`).digest('hex')}`;
}
