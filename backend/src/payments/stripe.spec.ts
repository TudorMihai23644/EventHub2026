import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import { HttpStripeClient, StripeConfig, StripeError, priceLabel, signStripePayload, stripeConfig, verifyStripeSignature } from './stripe';

const SECRET = 'whsec_test';
const body = Buffer.from('{"id":"evt_1","type":"checkout.session.completed"}');
const now = Date.parse('2026-11-06T12:00:00Z');
const t = now / 1000;

describe('semnătura webhook-ului Stripe', () => {
  it('validă → true', () => {
    expect(verifyStripeSignature(body, signStripePayload(body.toString(), SECRET, t), SECRET, now)).toBe(true);
  });
  it('mai multe semnături v1 (secret rotit): una bună ajunge', () => {
    const good = signStripePayload(body.toString(), SECRET, t).split(',')[1];
    expect(verifyStripeSignature(body, `t=${t},v1=${'0'.repeat(64)},${good}`, SECRET, now)).toBe(true);
  });
  it.each([
    ['alt secret', signStripePayload(body.toString(), 'whsec_other', t), body],
    ['corp modificat', signStripePayload(body.toString(), SECRET, t), Buffer.from(body.toString().replace('evt_1', 'evt_2'))],
    ['mai veche de 5 minute (retrimisă)', signStripePayload(body.toString(), SECRET, t - 301), body],
    ['fără v1', `t=${t}`, body],
    ['antet ciudat', 'nu-e-semnatura', body],
    ['lipsă', undefined, body],
  ])('%s → false', (_l, header, b) => {
    expect(verifyStripeSignature(b as Buffer, header as string | undefined, SECRET, now)).toBe(false);
  });
});

describe('Stripe', () => {
  it('config: activ doar cu ambele chei', () => {
    expect(stripeConfig({ STRIPE_SECRET_KEY: 'sk' }).enabled).toBe(false);
    expect(stripeConfig({ STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'wh' }).enabled).toBe(true);
  });
  it('prețul în lei', () => {
    expect(priceLabel(4990).replace(/\u00a0/g, ' ')).toBe('49,90 lei');
    expect(priceLabel(5000)).toBe('50 lei');
    expect(priceLabel(120000).replace(/\u00a0/g, ' ')).toMatch(/^1\.?200 lei$/);
  });
});

describe('HttpStripeClient (Stripe fals)', () => {
  let server: Server;
  let cfg: StripeConfig;
  let reply: { status: number; body: unknown };
  let last: { path: string; headers: IncomingMessage['headers']; form: Record<string, string> };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        last = { path: req.url!, headers: req.headers, form: Object.fromEntries(new URLSearchParams(raw)) };
        res.writeHead(reply.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    cfg = { enabled: true, secretKey: 'sk_test_1', webhookSecret: SECRET, apiUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, appUrl: 'http://app.test' };
  });
  afterAll(() => new Promise((ok) => server.close(ok)));

  it('sesiunea de plată: un loc, prețul în bani, RON, expirare, linkuri înapoi, cheie de idempotență', async () => {
    const expiresAt = new Date('2026-11-06T12:31:00Z');
    reply = { status: 200, body: { id: 'cs_1', url: 'https://checkout.stripe.test/cs_1', expires_at: expiresAt.getTime() / 1000 } };
    const s = await new HttpStripeClient(cfg).createCheckout({ paymentId: 'p1', eventId: 'e1', title: 'Concert', amountCents: 4990, email: 'a@b.ro', expiresAt });
    expect(s).toEqual({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1', expiresAt });
    expect(last.path).toBe('/v1/checkout/sessions');
    expect(last.headers.authorization).toBe('Bearer sk_test_1');
    expect(last.headers['idempotency-key']).toBe('checkout-p1');
    expect(last.form).toMatchObject({
      mode: 'payment', client_reference_id: 'p1', 'metadata[paymentId]': 'p1', customer_email: 'a@b.ro',
      'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'ron', 'line_items[0][price_data][unit_amount]': '4990',
      'line_items[0][price_data][product_data][name]': 'Concert', expires_at: String(expiresAt.getTime() / 1000),
      success_url: 'http://app.test/events/e1?plata=succes', cancel_url: 'http://app.test/events/e1?plata=anulata',
    });
  });

  it('returnarea: payment_intent + cheie refund-<id>', async () => {
    reply = { status: 200, body: { id: 're_1' } };
    await new HttpStripeClient(cfg).refund('pi_1', 'p1');
    expect(last).toMatchObject({ path: '/v1/refunds', form: { payment_intent: 'pi_1' } });
    expect(last.headers['idempotency-key']).toBe('refund-p1');
  });

  it.each([
    [500, true], [429, true], [400, false], [402, false],
  ])('HTTP %i → StripeError transient=%s, cu codul Stripe', async (status, transient) => {
    reply = { status, body: { error: { message: 'x', code: 'charge_already_refunded' } } };
    await expect(new HttpStripeClient(cfg).refund('pi', 'p')).rejects.toMatchObject({ transient, code: 'charge_already_refunded' });
  });

  it('Stripe nu răspunde → eroare trecătoare', async () => {
    await expect(new HttpStripeClient({ ...cfg, apiUrl: 'http://127.0.0.1:9' }).refund('pi', 'p')).rejects.toEqual(expect.objectContaining({ transient: true }));
    await expect(new HttpStripeClient({ ...cfg, apiUrl: 'http://127.0.0.1:9' }).refund('pi', 'p')).rejects.toBeInstanceOf(StripeError);
  });
});
