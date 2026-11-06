import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Event } from '../events/event.entity';
import { Registration } from '../registrations/registration.entity';
import { User } from '../users/user.entity';
import { Notifications } from '../mail/notifications.service';
import { Payment } from './payment.entity';
import { activeHolds } from './seats';
import { CURRENCY, STRIPE_CONFIG, StripeClient, StripeConfig, verifyStripeSignature } from './stripe';

/** Stripe nu acceptă sesiuni mai scurte de 30 de minute. */
export const CHECKOUT_MINUTES = 31;
/** Locul rămâne ținut încă puțin după expirarea sesiunii: o plată din ultima secundă își anunță webhook-ul cu întârziere. */
export const HOLD_GRACE_MINUTES = 5;

interface StripeEvent { id: string; type: string; data: { object: Record<string, unknown> } }

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly dataSource: DataSource,
    private readonly stripe: StripeClient,
    private readonly notifications: Notifications,
    @Inject(STRIPE_CONFIG) private readonly cfg: StripeConfig,
  ) {}

  /**
   * „Cumpără bilet”: rezervă un loc (cu lock-ul evenimentului, ca la înscriere), apoi cere la Stripe pagina de plată.
   * Stripe e apelat DUPĂ tranzacție: lock-ul nu se ține în timpul unei cereri externe. Dacă Stripe nu răspunde,
   * rezervarea se șterge (locul revine). Un participant care are deja o plată în curs primește aceeași pagină.
   */
  async checkout(userId: string, eventId: string): Promise<{ url: string; expiresAt: Date }> {
    if (!this.cfg.enabled) throw new ServiceUnavailableException('Plățile nu sunt configurate.');
    const hold = await this.dataSource.transaction(async (m) => {
      const event = await m.findOne(Event, { where: { id: eventId }, lock: { mode: 'pessimistic_write' } });
      if (!event) throw new NotFoundException('Evenimentul nu a fost găsit.');
      if (!event.priceCents) throw new BadRequestException('Evenimentul este gratuit: înscrie-te direct.');
      if (new Date(event.startsAt).getTime() <= Date.now()) throw new BadRequestException('Evenimentul a avut deja loc.');
      if (await m.exists(Registration, { where: { userId, eventId } })) throw new ConflictException('Ești deja înscris la acest eveniment.');
      const [current] = await m.query(
        `SELECT id, "checkoutUrl", "expiresAt" FROM payments
         WHERE "userId" = $1 AND "eventId" = $2 AND status = 'PENDING' AND "checkoutUrl" IS NOT NULL AND "expiresAt" > now() + interval '${HOLD_GRACE_MINUTES + 2} minutes'`,
        [userId, eventId],
      );
      if (current) return { resume: { url: current.checkoutUrl as string, expiresAt: new Date(current.expiresAt) } };
      const taken = (await m.count(Registration, { where: { eventId } })) + (await activeHolds(m, eventId));
      if (taken >= event.capacity) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'SOLD_OUT', message: 'Nu mai sunt locuri disponibile.' });
      const user = await m.findOneByOrFail(User, { id: userId });
      const sessionEnds = new Date(Date.now() + CHECKOUT_MINUTES * 60_000);
      const payment = await m.save(m.create(Payment, {
        userId, eventId, eventTitle: event.title, email: user.email, amountCents: event.priceCents, currency: CURRENCY,
        status: 'PENDING', expiresAt: new Date(sessionEnds.getTime() + HOLD_GRACE_MINUTES * 60_000),
      }));
      return { payment, sessionEnds, title: event.title };
    });
    if ('resume' in hold) return hold.resume!;

    const { payment, sessionEnds, title } = hold;
    try {
      const session = await this.stripe.createCheckout({
        paymentId: payment.id, eventId, title, amountCents: payment.amountCents, email: payment.email, expiresAt: sessionEnds,
      });
      await this.dataSource.getRepository(Payment).update({ id: payment.id }, {
        stripeSessionId: session.id, checkoutUrl: session.url, expiresAt: new Date(session.expiresAt.getTime() + HOLD_GRACE_MINUTES * 60_000),
      });
      return { url: session.url, expiresAt: session.expiresAt };
    } catch (e) {
      await this.dataSource.getRepository(Payment).delete({ id: payment.id, status: 'PENDING' }); // locul revine
      this.logger.error(`Plata nu a putut fi pornită: ${e}`);
      throw new ServiceUnavailableException('Plata nu a putut fi pornită. Încearcă din nou peste câteva momente.');
    }
  }

  /** Webhook-ul Stripe. Semnătura greșită → 400 (Stripe nu reîncearcă); o eroare internă → 500 (Stripe reîncearcă). */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!this.cfg.enabled) throw new NotFoundException();
    if (!rawBody || !verifyStripeSignature(rawBody, signature, this.cfg.webhookSecret)) {
      throw new BadRequestException('Semnătură Stripe invalidă.');
    }
    const event = JSON.parse(rawBody.toString('utf8')) as StripeEvent;
    const s = event.data?.object ?? {};
    const paymentId = (s.client_reference_id ?? (s.metadata as Record<string, string> | undefined)?.paymentId) as string | undefined;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (s.payment_status === 'paid' && paymentId) await this.complete(paymentId, s);
        break;
      case 'checkout.session.expired':
        if (paymentId) {
          await this.dataSource.query(`UPDATE payments SET status = 'EXPIRED', "updatedAt" = now() WHERE id = $1 AND status = 'PENDING'`, [paymentId]);
        }
        break;
      default: // celelalte tipuri nu ne interesează (răspunsul 200 îi spune lui Stripe să nu le mai trimită)
    }
    return { received: true };
  }

  /**
   * Plata a reușit → înscriere (bilet + email de confirmare), o singură dată (Stripe poate trimite webhook-ul de mai multe ori).
   * Cazurile în care banii trebuie returnați, nu păstrați: evenimentul a fost șters sau a început, contul a fost șters,
   * participantul era deja înscris, suma nu se potrivește, sau rezervarea expirase și între timp locurile s-au ocupat.
   */
  private async complete(paymentId: string, s: Record<string, unknown>) {
    await this.dataSource.transaction(async (m) => {
      const p = await m.findOne(Payment, { where: { id: paymentId }, lock: { mode: 'pessimistic_write' } });
      if (!p) return this.logger.warn(`Webhook pentru o plată necunoscută: ${paymentId}`);
      if (!['PENDING', 'EXPIRED', 'CANCELLED'].includes(p.status)) return; // deja tratată
      p.paymentIntentId = typeof s.payment_intent === 'string' ? s.payment_intent : p.paymentIntentId;
      p.stripeSessionId ??= typeof s.id === 'string' ? s.id : null;

      const refund = async (why: string) => {
        this.logger.warn(`Plata ${p.id} se returnează: ${why}`);
        p.status = 'REFUND_PENDING';
        p.refundAfter = new Date(0);
        p.lastError = why;
        await m.save(p);
      };
      if (s.amount_total !== p.amountCents || String(s.currency).toUpperCase() !== p.currency) return refund('suma diferă de prețul rezervat');
      if (p.status === 'CANCELLED' || !p.eventId) return refund('evenimentul a fost șters');
      if (!p.userId) return refund('contul a fost șters');
      const event = await m.findOne(Event, { where: { id: p.eventId }, lock: { mode: 'pessimistic_write' } });
      if (!event) return refund('evenimentul a fost șters');
      if (new Date(event.startsAt).getTime() <= Date.now()) return refund('evenimentul a început');
      if (await m.exists(Registration, { where: { userId: p.userId, eventId: p.eventId } })) return refund('era deja înscris');
      if (p.status === 'EXPIRED' || new Date(p.expiresAt).getTime() <= Date.now()) {
        // rezervarea nu mai ține locul: intră doar dacă e încă loc (fără rezervarea lui, care nu se mai numără)
        const taken = (await m.count(Registration, { where: { eventId: p.eventId } })) + (await activeHolds(m, p.eventId));
        if (taken >= event.capacity) return refund('rezervarea expirase și locurile s-au ocupat');
      }
      await m.insert(Registration, { userId: p.userId, eventId: p.eventId });
      p.status = 'PAID';
      p.lastError = null;
      await m.save(p);
      const taken = await m.count(Registration, { where: { eventId: p.eventId } });
      await this.notifications.registrationCreated(m, { userId: p.userId, event, taken });
    });
  }

}
