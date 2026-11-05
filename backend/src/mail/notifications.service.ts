import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { MAIL_CONFIG, MailConfig } from './mail.config';
import { OutboxEmail } from './outbox.entity';
import { EmailContent, EventInfo, eventChanges } from './templates';
import * as T from './templates';
import { User } from '../users/user.entity';
import { Event } from '../events/event.entity';
import { Registration } from '../registrations/registration.entity';
import { WaitlistEntry } from '../waitlist/waitlist-entry.entity';

// Decide cine primește ce email și îl pune în coadă (email_outbox).
// Fiecare metodă primește EntityManager-ul tranzacției apelantului: dacă acțiunea eșuează și tranzacția
// se anulează, emailurile dispar odată cu ea. Nimic nu se trimite de aici; trimite OutboxWorker.
@Injectable()
export class Notifications {
  constructor(@Inject(MAIL_CONFIG) private readonly cfg: MailConfig) {}

  /** Participantul s-a înscris: confirmare pentru el, anunț pentru organizator. */
  async registrationCreated(m: EntityManager, d: { userId: string; event: Event; taken: number }) {
    const participant = await this.user(m, d.userId);
    const organizer = await this.user(m, d.event.organizerId);
    const event = info(d.event);
    await this.enqueue(m, 'registration-confirmed', participant, T.registrationConfirmed(this.cfg, { name: participant.name, event }));
    await this.enqueue(m, 'organizer-registration', organizer, T.organizerNewRegistration(this.cfg, {
      organizerName: organizer.name, participantName: participant.name, event, taken: d.taken, capacity: d.event.capacity,
    }));
  }

  /** Participantul și-a anulat înscrierea: confirmare pentru el, anunț pentru organizator. */
  async registrationCancelled(m: EntityManager, d: { userId: string; event: Event; taken: number }) {
    const participant = await this.user(m, d.userId);
    const organizer = await this.user(m, d.event.organizerId);
    const event = info(d.event);
    await this.enqueue(m, 'registration-cancelled', participant, T.registrationCancelled(this.cfg, { name: participant.name, event }));
    await this.enqueue(m, 'organizer-cancellation', organizer, T.organizerCancellation(this.cfg, {
      organizerName: organizer.name, participantName: participant.name, event, taken: d.taken, capacity: d.event.capacity,
    }));
  }

  /** Evenimentul s-a modificat. Email doar dacă s-au schimbat titlul, data/ora sau locația. */
  async eventUpdated(m: EntityManager, before: EventInfo, after: Event) {
    const next = info(after);
    if (!eventChanges(this.cfg, before, next).length) return 0;
    const people = await this.participants(m, after.id);
    const waiting = await this.waiting(m, after.id);
    for (const p of people) {
      await this.enqueue(m, 'event-updated', p, T.eventUpdated(this.cfg, { name: p.name, before, after: next }));
    }
    for (const p of waiting) {
      await this.enqueue(m, 'event-updated', p, T.eventUpdated(this.cfg, { name: p.name, before, after: next, waiting: true }));
    }
    return people.length + waiting.length;
  }

  /** Evenimentul va fi șters: anunță participanții și lista de așteptare ÎNAINTE de ștergere (după ea, listele nu mai există). */
  async eventCancelled(m: EntityManager, event: Event) {
    const people = await this.participants(m, event.id);
    const waiting = await this.waiting(m, event.id);
    for (const p of people) {
      await this.enqueue(m, 'event-cancelled', p, T.eventCancelled(this.cfg, { name: p.name, event: info(event) }));
    }
    for (const p of waiting) {
      await this.enqueue(m, 'event-cancelled', p, T.eventCancelled(this.cfg, { name: p.name, event: info(event), waiting: true }));
    }
    return people.length + waiting.length;
  }

  /** Memento-ul de cu o zi înainte (trimis de RemindersService). */
  async reminder(m: EntityManager, d: { user: Pick<User, 'name' | 'email'>; event: Event; hasWaitlist: boolean; now: Date }) {
    await this.enqueue(m, 'event-reminder', d.user, T.eventReminder(this.cfg, {
      name: d.user.name, event: info(d.event), hasWaitlist: d.hasWaitlist, now: d.now,
    }));
  }

  // ---------- listă de așteptare ----------

  async waitlistJoined(m: EntityManager, d: { userId: string; event: Event; position: number }) {
    const user = await this.user(m, d.userId);
    await this.enqueue(m, 'waitlist-joined', user, T.waitlistJoined(this.cfg, { name: user.name, event: info(d.event), position: d.position }));
  }

  /** Primul de pe listă a fost înscris automat: email pentru el + anunțul obișnuit pentru organizator. */
  async waitlistPromoted(m: EntityManager, d: { userId: string; event: Event; taken: number }) {
    const participant = await this.user(m, d.userId);
    const organizer = await this.user(m, d.event.organizerId);
    const event = info(d.event);
    await this.enqueue(m, 'waitlist-promoted', participant, T.waitlistPromoted(this.cfg, { name: participant.name, event }));
    await this.enqueue(m, 'organizer-registration', organizer, T.organizerNewRegistration(this.cfg, {
      organizerName: organizer.name, participantName: participant.name, event,
      taken: d.taken, capacity: d.event.capacity, fromWaitlist: true,
    }));
  }

  // ---------- cont ----------
  // `token` este în clar doar aici și în email; rândul din coadă e marcat `sensitive` și se golește după trimitere.

  async passwordReset(m: EntityManager, user: Pick<User, 'name' | 'email'>, token: string) {
    await this.enqueue(m, 'password-reset', user, T.passwordReset(this.cfg, { name: user.name, token }), true);
  }

  async emailVerification(m: EntityManager, user: Pick<User, 'name' | 'email'>, token: string) {
    await this.enqueue(m, 'email-verify', user, T.emailVerification(this.cfg, { name: user.name, token }), true);
  }

  async passwordChanged(m: EntityManager, user: Pick<User, 'name' | 'email'>) {
    await this.enqueue(m, 'password-changed', user, T.passwordChanged(this.cfg, { name: user.name }));
  }

  private async participants(m: EntityManager, eventId: string): Promise<User[]> {
    const rows = await m.find(Registration, { where: { eventId }, relations: { user: true }, order: { createdAt: 'ASC' } });
    return rows.map((r) => r.user);
  }

  private async waiting(m: EntityManager, eventId: string): Promise<User[]> {
    const rows = await m.find(WaitlistEntry, { where: { eventId }, relations: { user: true }, order: { createdAt: 'ASC', id: 'ASC' } });
    return rows.map((r) => r.user);
  }

  private async user(m: EntityManager, id: string): Promise<User> {
    return m.findOneOrFail(User, { where: { id } });
  }

  // Un email per persoană: adresele participanților nu ajung unii la alții.
  private async enqueue(m: EntityManager, kind: string, to: Pick<User, 'email'>, content: EmailContent, sensitive = false) {
    await m.insert(OutboxEmail, { to: to.email, kind, sensitive, ...content });
  }
}

export const info = (
  e: Pick<Event, 'id' | 'title' | 'startsAt' | 'location'> & Partial<Pick<Event, 'endsAt' | 'format' | 'onlineUrl'>>,
): EventInfo => ({
  id: e.id,
  title: e.title,
  startsAt: new Date(e.startsAt),
  location: e.location,
  endsAt: e.endsAt ? new Date(e.endsAt) : null,
  format: e.format ?? 'PHYSICAL',
  onlineUrl: e.onlineUrl ?? null,
});
