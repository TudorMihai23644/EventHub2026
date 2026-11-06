import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { clearTables, openTestDb } from '../test/int-db';
import { PaymentsService } from './payments.service';
import { RefundWorker, MAX_REFUND_ATTEMPTS } from './refund.worker';
import { Payment } from './payment.entity';
import { CheckoutSession, StripeClient, StripeConfig, StripeError, signStripePayload } from './stripe';
import { Notifications } from '../mail/notifications.service';
import { OutboxEmail } from '../mail/outbox.entity';
import { RegistrationsService } from '../registrations/registrations.service';
import { Registration } from '../registrations/registration.entity';
import { WaitlistService } from '../waitlist/waitlist.service';
import { EventsService } from '../events/events.service';
import { Event } from '../events/event.entity';
import { User } from '../users/user.entity';

const mail = { appUrl: 'http://app.test', timeZone: 'Europe/Bucharest', from: 'x@test' };
const cfg: StripeConfig = { enabled: true, secretKey: 'sk', webhookSecret: 'whsec_int', apiUrl: 'http://fake', appUrl: 'http://app.test' };

class FakeStripe extends StripeClient {
  sessions: Parameters<StripeClient['createCheckout']>[0][] = [];
  refunds: { pi: string; paymentId: string }[] = [];
  failCheckout = false;
  refundError: StripeError | null = null;
  async createCheckout(p: Parameters<StripeClient['createCheckout']>[0]): Promise<CheckoutSession> {
    if (this.failCheckout) throw new StripeError('down', true);
    this.sessions.push(p);
    return { id: `cs_${p.paymentId}`, url: `https://checkout.test/${p.paymentId}`, expiresAt: p.expiresAt };
  }
  async refund(pi: string, paymentId: string) {
    if (this.refundError) throw this.refundError;
    this.refunds.push({ pi, paymentId });
  }
}

describe('Bilete cu plată (integrare)', () => {
  let ds: DataSource;
  let stripe: FakeStripe;
  let payments: PaymentsService;
  let worker: RefundWorker;
  let registrations: RegistrationsService;
  let waitlist: WaitlistService;
  let events: EventsService;
  let pays: Repository<Payment>;
  let regs: Repository<Registration>;
  let users: Repository<User>;
  let org: User;
  let n = 0;

  beforeAll(async () => {
    ds = await openTestDb();
    pays = ds.getRepository(Payment);
    regs = ds.getRepository(Registration);
    users = ds.getRepository(User);
  });
  afterAll(() => ds?.destroy());
  beforeEach(async () => {
    await clearTables(ds);
    stripe = new FakeStripe();
    const notifications = new Notifications(mail);
    payments = new PaymentsService(ds, stripe, notifications, cfg);
    worker = new RefundWorker(ds, stripe, notifications);
    waitlist = new WaitlistService(ds, notifications);
    registrations = new RegistrationsService(ds, regs, notifications, waitlist);
    events = new EventsService(ds.getRepository(Event), regs, ds, notifications, waitlist, { enabled: true });
    org = await user('ORGANIZER');
  });

  const user = (role: 'PARTICIPANT' | 'ORGANIZER' = 'PARTICIPANT') =>
    users.save(users.create({ name: `U${++n}`, email: `pay${++n}@test.ro`, passwordHash: 'x', role, emailVerifiedAt: new Date() }));
  const paidEvent = async (over: Record<string, unknown> = {}) =>
    (await events.create({ id: org.id, role: 'ORGANIZER', emailVerified: true }, {
      title: 'Concert', description: 'Descriere de test', capacity: 2, priceCents: 4990, category: 'CONCERT', location: 'Brașov',
      startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), ...over,
    } as never));
  const viewAs = (u: User, id: string) => events.findOne(id, { id: u.id, role: 'PARTICIPANT', emailVerified: true });
  const paymentOf = (u: User) => pays.findOneByOrFail({ userId: u.id });
  /** Webhook-ul pe care l-ar trimite Stripe, semnat cu secretul nostru. */
  const webhook = (type: string, p: Payment, over: Record<string, unknown> = {}) => {
    const json = JSON.stringify({ id: `evt_${++n}`, type, data: { object: {
      id: p.stripeSessionId, client_reference_id: p.id, metadata: { paymentId: p.id }, payment_status: 'paid',
      payment_intent: `pi_${p.id}`, amount_total: p.amountCents, currency: 'ron', ...over,
    } } });
    return payments.handleWebhook(Buffer.from(json), signStripePayload(json, cfg.webhookSecret));
  };
  const mails = (kind: string) => ds.getRepository(OutboxEmail).countBy({ kind });

  it('cumpărare: locul e ținut cât timp plătește, apoi plata → înscriere cu bilet și email', async () => {
    const e = await paidEvent();
    const a = await user();
    expect((await viewAs(a, e.id))).toMatchObject({ canBuy: true, canRegister: false, price: { cents: 4990 } });
    const { url } = await payments.checkout(a.id, e.id);
    expect(url).toMatch(/^https:\/\/checkout\.test\//);
    expect(stripe.sessions[0]).toMatchObject({ amountCents: 4990, email: a.email, title: 'Concert' });
    const view = await viewAs(a, e.id);
    expect(view).toMatchObject({ availableSeats: 1, canBuy: false, checkout: { url } });
    expect((await payments.checkout(a.id, e.id)).url).toBe(url); // din nou: aceeași pagină, nu încă un loc
    expect(stripe.sessions).toHaveLength(1);

    await webhook('checkout.session.completed', await paymentOf(a));
    expect(await paymentOf(a)).toMatchObject({ status: 'PAID', paymentIntentId: expect.stringMatching(/^pi_/) });
    expect((await viewAs(a, e.id))).toMatchObject({ isRegistered: true, ticket: expect.any(Object), availableSeats: 1, checkout: null });
    expect(await mails('registration-confirmed')).toBe(1);
  });

  it('webhook trimis de două ori (Stripe reîncearcă): o singură înscriere, un singur email', async () => {
    const e = await paidEvent();
    const a = await user();
    await payments.checkout(a.id, e.id);
    const p = await paymentOf(a);
    await Promise.all([webhook('checkout.session.completed', p), webhook('checkout.session.completed', p)]);
    await webhook('checkout.session.completed', p);
    expect(await regs.countBy({ eventId: e.id })).toBe(1);
    expect((await paymentOf(a)).status).toBe('PAID'); // nu „era deja înscris → returnare”
    expect(await mails('registration-confirmed')).toBe(1);
  });

  it('trei cumpărători simultani, două locuri: două rezervări, al treilea SOLD_OUT', async () => {
    const e = await paidEvent();
    const people = [await user(), await user(), await user()];
    const results = await Promise.allSettled(people.map((u) => payments.checkout(u.id, e.id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(rejected.reason.getResponse()).toMatchObject({ code: 'SOLD_OUT' });
  });

  it('Stripe indisponibil: 503, iar locul revine', async () => {
    const e = await paidEvent({ capacity: 1 });
    stripe.failCheckout = true;
    await expect(payments.checkout((await user()).id, e.id)).rejects.toThrow(ServiceUnavailableException);
    expect(await pays.count()).toBe(0);
    stripe.failCheckout = false;
    await expect(payments.checkout((await user()).id, e.id)).resolves.toMatchObject({ url: expect.any(String) });
  });

  it('semnătură greșită → 400, nimic schimbat; sumă diferită → returnare, fără înscriere', async () => {
    const e = await paidEvent();
    const a = await user();
    await payments.checkout(a.id, e.id);
    const p = await paymentOf(a);
    const json = JSON.stringify({ type: 'checkout.session.completed', data: { object: { client_reference_id: p.id, payment_status: 'paid', amount_total: 4990, currency: 'ron' } } });
    await expect(payments.handleWebhook(Buffer.from(json), signStripePayload(json, 'whsec_altul'))).rejects.toThrow(BadRequestException);
    await expect(payments.handleWebhook(Buffer.from(json), undefined)).rejects.toThrow(BadRequestException);
    expect((await paymentOf(a)).status).toBe('PENDING');
    await webhook('checkout.session.completed', p, { amount_total: 100 });
    expect(await paymentOf(a)).toMatchObject({ status: 'REFUND_PENDING' });
    expect(await regs.count()).toBe(0);
  });

  it('sesiune expirată → locul se eliberează; plata venită totuși târziu: înscriere dacă e loc, altfel returnare', async () => {
    const e = await paidEvent({ capacity: 1 });
    const [a, b] = [await user(), await user()];
    await payments.checkout(a.id, e.id);
    await webhook('checkout.session.expired', await paymentOf(a));
    expect((await paymentOf(a)).status).toBe('EXPIRED');
    expect((await viewAs(b, e.id)).availableSeats).toBe(1);

    await webhook('checkout.session.completed', await paymentOf(a)); // locul e încă liber
    expect((await paymentOf(a)).status).toBe('PAID');

    const e2 = await paidEvent({ capacity: 1 });
    await payments.checkout(a.id, e2.id);
    const late = await pays.findOneByOrFail({ userId: a.id, eventId: e2.id });
    await webhook('checkout.session.expired', late);
    await payments.checkout(b.id, e2.id); // b ia locul
    await webhook('checkout.session.completed', await pays.findOneByOrFail({ userId: b.id, eventId: e2.id }));
    await webhook('checkout.session.completed', late); // a plătește prea târziu
    expect((await pays.findOneByOrFail({ id: late.id })).status).toBe('REFUND_PENDING');
    expect(await regs.countBy({ eventId: e2.id })).toBe(1);
  });

  it('rezervarea expiră și fără webhook (după ceasul bazei)', async () => {
    const e = await paidEvent({ capacity: 1 });
    const a = await user();
    await payments.checkout(a.id, e.id);
    await ds.query(`UPDATE payments SET "expiresAt" = now() - interval '1 second'`);
    expect((await viewAs(await user(), e.id)).availableSeats).toBe(1);
    await expect(payments.checkout((await user()).id, e.id)).resolves.toBeDefined();
  });

  it('anularea unui bilet plătit: înscrierea dispare imediat, banii se returnează în fundal, cu email', async () => {
    const e = await paidEvent();
    const a = await user();
    await payments.checkout(a.id, e.id);
    await webhook('checkout.session.completed', await paymentOf(a));
    await registrations.cancel(a.id, e.id);
    expect(await paymentOf(a)).toMatchObject({ status: 'REFUND_PENDING' });
    const cancelMail = await ds.getRepository(OutboxEmail).findOneByOrFail({ kind: 'registration-cancelled' });
    expect(cancelMail.text).toContain('Banii pentru bilet îți vor fi returnați');

    expect(await worker.processBatch()).toBe(1);
    expect(stripe.refunds).toEqual([{ pi: `pi_${(await paymentOf(a)).id}`, paymentId: (await paymentOf(a)).id }]);
    expect((await paymentOf(a)).status).toBe('REFUNDED');
    const refundMail = await ds.getRepository(OutboxEmail).findOneByOrFail({ kind: 'payment-refunded' });
    expect(refundMail.text.replace(/\u00a0/g, ' ')).toContain('49,90 lei');
    expect(await worker.processBatch()).toBe(0); // nu de două ori
  });

  it('returnarea: Stripe cade → reîncercări cu pauză; eroare definitivă → REFUND_FAILED; deja returnată → REFUNDED', async () => {
    const e = await paidEvent({ capacity: 3 });
    const [a, b, c] = [await user(), await user(), await user()];
    for (const u of [a, b, c]) {
      await payments.checkout(u.id, e.id);
      await webhook('checkout.session.completed', await paymentOf(u));
    }
    await registrations.cancel(a.id, e.id);
    stripe.refundError = new StripeError('down', true);
    await worker.processBatch();
    const pa = await paymentOf(a);
    expect(pa).toMatchObject({ status: 'REFUND_PENDING', refundAttempts: 1 });
    expect(new Date(pa.refundAfter).getTime()).toBeGreaterThan(Date.now() + 50_000);
    await ds.query(`UPDATE payments SET "refundAttempts" = $1, "refundAfter" = now() WHERE id = $2`, [MAX_REFUND_ATTEMPTS - 1, pa.id]);
    await worker.processBatch();
    expect((await paymentOf(a)).status).toBe('REFUND_FAILED');

    await registrations.cancel(b.id, e.id);
    stripe.refundError = new StripeError('nope', false, 'charge_disputed');
    await worker.processBatch();
    expect((await paymentOf(b)).status).toBe('REFUND_FAILED');

    await registrations.cancel(c.id, e.id);
    stripe.refundError = new StripeError('already', false, 'charge_already_refunded');
    await worker.processBatch();
    expect((await paymentOf(c)).status).toBe('REFUNDED');
  });

  it('eveniment șters: cei care au plătit primesc banii; plata începută și terminată după → returnată', async () => {
    const e = await paidEvent();
    const [a, b] = [await user(), await user()];
    await payments.checkout(a.id, e.id);
    await webhook('checkout.session.completed', await paymentOf(a));
    await payments.checkout(b.id, e.id);
    await events.remove(org.id, e.id);
    expect(await paymentOf(a)).toMatchObject({ status: 'REFUND_PENDING', eventId: null, eventTitle: 'Concert' });
    expect(await paymentOf(b)).toMatchObject({ status: 'CANCELLED', eventId: null });
    await webhook('checkout.session.completed', await paymentOf(b));
    expect((await paymentOf(b)).status).toBe('REFUND_PENDING');
    expect(await worker.processBatch()).toBe(2);
  });

  it('eveniment cu plată: fără înscriere gratuită, fără listă de așteptare; capacitatea nu coboară sub rezervări', async () => {
    const e = await paidEvent({ capacity: 1 });
    const a = await user();
    await expect(registrations.register(a.id, e.id)).rejects.toMatchObject({ response: { code: 'PAYMENT_REQUIRED' } });
    await payments.checkout(a.id, e.id);
    await expect(waitlist.join((await user()).id, e.id)).rejects.toThrow('listă de așteptare');
    const owner = { id: org.id, role: 'ORGANIZER' as const, emailVerified: true };
    await expect(events.update(owner, e.id, { capacity: 1 })).resolves.toBeDefined();
    const e2 = await paidEvent({ capacity: 2 });
    await payments.checkout(a.id, e2.id);
    await payments.checkout((await user()).id, e2.id);
    await expect(events.update(owner, e2.id, { capacity: 1 })).rejects.toThrow('2 locuri rezervate');
  });

  it('nu poate deveni gratuit cu bilete plătite; poate schimba prețul pentru următorii', async () => {
    const e = await paidEvent();
    const a = await user();
    await payments.checkout(a.id, e.id);
    await webhook('checkout.session.completed', await paymentOf(a));
    const owner = { id: org.id, role: 'ORGANIZER' as const, emailVerified: true };
    await expect(events.update(owner, e.id, { priceCents: null })).rejects.toThrow('nu poate deveni gratuit');
    expect((await events.update(owner, e.id, { priceCents: 5990 })).price?.cents).toBe(5990);
    expect(await events.stats(org.id, e.id, mail.timeZone)).toMatchObject({ revenue: { cents: 4990, ticketsSold: 1 } });
  });

  it('plățile oprite pe server: nu se pot crea evenimente cu plată; cele existente apar „vânzări oprite”', async () => {
    const e = await paidEvent();
    const off = new EventsService(ds.getRepository(Event), regs, ds, new Notifications(mail), waitlist, { enabled: false });
    const owner = { id: org.id, role: 'ORGANIZER' as const, emailVerified: true };
    await expect(off.create(owner, { title: 'Altul', description: 'Descriere de test', capacity: 5, priceCents: 1000, category: 'CONCERT', location: 'Cluj', startsAt: new Date(Date.now() + 86_400_000).toISOString() } as never))
      .rejects.toThrow('Plățile nu sunt configurate');
    expect(await off.findOne(e.id, { id: (await user()).id, role: 'PARTICIPANT', emailVerified: true })).toMatchObject({ canBuy: false, salesClosed: true, canRegister: false });
    await expect(new PaymentsService(ds, stripe, new Notifications(mail), { ...cfg, enabled: false }).checkout((await user()).id, e.id)).rejects.toThrow(ServiceUnavailableException);
  });
});
