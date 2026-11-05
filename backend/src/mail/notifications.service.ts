import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { MAIL_CONFIG, MailConfig } from './mail.config';
import { OutboxEmail } from './outbox.entity';
import { EmailContent, EventInfo, eventChanges } from './templates';
import * as T from './templates';
import { User } from '../users/user.entity';
import { Event } from '../events/event.entity';
import { Registration } from '../registrations/registration.entity';

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
    for (const p of people) {
      await this.enqueue(m, 'event-updated', p, T.eventUpdated(this.cfg, { name: p.name, before, after: next }));
    }
    return people.length;
  }

  /** Evenimentul va fi șters: anunță participanții ÎNAINTE de ștergere (după ea, lista lor nu mai există). */
  async eventCancelled(m: EntityManager, event: Event) {
    const people = await this.participants(m, event.id);
    for (const p of people) {
      await this.enqueue(m, 'event-cancelled', p, T.eventCancelled(this.cfg, { name: p.name, event: info(event) }));
    }
    return people.length;
  }

  private async participants(m: EntityManager, eventId: string): Promise<User[]> {
    const rows = await m.find(Registration, { where: { eventId }, relations: { user: true }, order: { createdAt: 'ASC' } });
    return rows.map((r) => r.user);
  }

  private async user(m: EntityManager, id: string): Promise<User> {
    return m.findOneOrFail(User, { where: { id } });
  }

  // Un email per persoană: adresele participanților nu ajung unii la alții.
  private async enqueue(m: EntityManager, kind: string, to: User, content: EmailContent) {
    await m.insert(OutboxEmail, { to: to.email, kind, ...content });
  }
}

export const info = (e: Pick<Event, 'id' | 'title' | 'startsAt' | 'location'>): EventInfo => ({
  id: e.id,
  title: e.title,
  startsAt: new Date(e.startsAt),
  location: e.location,
});
