import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { WaitlistEntry } from './waitlist-entry.entity';
import { Event } from '../events/event.entity';
import { Registration } from '../registrations/registration.entity';
import { Notifications } from '../mail/notifications.service';

/**
 * Lista de așteptare. Invariant: un eveniment nu are locuri libere cât timp cineva așteaptă.
 * Toate operațiile care schimbă locurile sau lista blochează rândul evenimentului (același lock ca la înscriere,
 * anulare și modificarea capacității), deci invariantul rămâne adevărat și la cereri simultane.
 */
@Injectable()
export class WaitlistService {
  constructor(private readonly dataSource: DataSource, private readonly notifications: Notifications) {}

  join(userId: string, eventId: string) {
    return this.dataSource.transaction(async (m) => {
      const event = await lockEvent(m, eventId);
      if (isPast(event)) throw new BadRequestException('Evenimentul a avut deja loc.');
      if (await m.exists(Registration, { where: { userId, eventId } })) throw new ConflictException('Ești deja înscris la acest eveniment.');
      if (await m.exists(WaitlistEntry, { where: { userId, eventId } })) throw new ConflictException('Ești deja pe lista de așteptare.');
      const taken = await m.count(Registration, { where: { eventId } });
      if (taken < event.capacity) {
        throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'SEATS_AVAILABLE', message: 'Mai sunt locuri: te poți înscrie direct.' });
      }
      await m.insert(WaitlistEntry, { userId, eventId });
      const position = await m.count(WaitlistEntry, { where: { eventId } }); // lock-ul ținut: noul venit e ultimul
      await this.notifications.waitlistJoined(m, { userId, event, position });
      return { position, waitlistCount: position };
    });
  }

  leave(userId: string, eventId: string): Promise<void> {
    return this.dataSource.transaction(async (m) => {
      await lockEvent(m, eventId); // pe rând cu o eventuală promovare
      const res = await m.delete(WaitlistEntry, { userId, eventId });
      if (!res.affected) throw new NotFoundException('Nu ești pe lista de așteptare a acestui eveniment.');
    });
  }

  /**
   * Cât timp sunt locuri libere și oameni care așteaptă: primul de pe listă este înscris automat.
   * Se apelează DIN tranzacția apelantului, care ține deja lock-ul pe eveniment (anulare, creșterea capacității).
   * După începerea evenimentului nu se mai promovează nimeni.
   */
  async promote(m: EntityManager, event: Event): Promise<number> {
    if (isPast(event)) return 0;
    let taken = await m.count(Registration, { where: { eventId: event.id } });
    let promoted = 0;
    while (taken < event.capacity) {
      const next = await m.findOne(WaitlistEntry, { where: { eventId: event.id }, order: { createdAt: 'ASC', id: 'ASC' } });
      if (!next) break;
      await m.delete(WaitlistEntry, { id: next.id });
      await m.insert(Registration, { userId: next.userId, eventId: event.id });
      taken++;
      promoted++;
      await this.notifications.waitlistPromoted(m, { userId: next.userId, event, taken });
    }
    return promoted;
  }

  /** Locul utilizatorului (1 = următorul) pe listele evenimentelor date. */
  async positions(userId: string, eventIds: string[]): Promise<Map<string, number>> {
    if (!eventIds.length) return new Map();
    const rows: { eventId: string; position: number }[] = await this.dataSource.query(
      `SELECT w."eventId",
              (SELECT count(*) FROM waitlist_entries x
                WHERE x."eventId" = w."eventId" AND (x."createdAt", x.id) <= (w."createdAt", w.id))::int AS position
         FROM waitlist_entries w
        WHERE w."userId" = $1 AND w."eventId" = ANY($2::uuid[])`,
      [userId, eventIds],
    );
    return new Map(rows.map((r) => [r.eventId, r.position]));
  }

  /** Listele de așteptare ale participantului, cu locul pe fiecare. */
  async mine(userId: string) {
    const entries = await this.dataSource.getRepository(WaitlistEntry).find({
      where: { userId },
      relations: { event: true },
      order: { createdAt: 'DESC' },
    });
    const pos = await this.positions(userId, entries.map((e) => e.eventId));
    const counts = await this.counts(entries.map((e) => e.eventId));
    const now = Date.now();
    return entries.map((w) => {
      const past = new Date(w.event.startsAt).getTime() <= now;
      return {
        id: w.id,
        joinedAt: w.createdAt,
        position: pos.get(w.eventId) ?? null,
        waitlistCount: counts.get(w.eventId) ?? 0,
        isPast: past,
        canLeave: !past,
        event: { id: w.event.id, title: w.event.title, startsAt: w.event.startsAt, location: w.event.location, capacity: w.event.capacity },
      };
    });
  }

  /** Cine așteaptă, în ordine (doar pentru organizatorul evenimentului). */
  async listForOwner(organizerId: string, eventId: string) {
    const event = await this.dataSource.getRepository(Event).findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evenimentul nu a fost găsit.');
    if (event.organizerId !== organizerId) throw new ForbiddenException('Doar organizatorul evenimentului poate vedea lista de așteptare.');
    const rows = await this.dataSource.getRepository(WaitlistEntry).find({
      where: { eventId },
      relations: { user: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return rows.map((w, i) => ({ id: w.id, position: i + 1, joinedAt: w.createdAt, user: { id: w.user.id, name: w.user.name, email: w.user.email } }));
  }

  private async counts(eventIds: string[]): Promise<Map<string, number>> {
    if (!eventIds.length) return new Map();
    const rows: { eventId: string; n: number }[] = await this.dataSource.query(
      `SELECT "eventId", count(*)::int AS n FROM waitlist_entries WHERE "eventId" = ANY($1::uuid[]) GROUP BY "eventId"`,
      [eventIds],
    );
    return new Map(rows.map((r) => [r.eventId, r.n]));
  }
}

async function lockEvent(m: EntityManager, eventId: string): Promise<Event> {
  const event = await m.findOne(Event, { where: { id: eventId }, lock: { mode: 'pessimistic_write' } });
  if (!event) throw new NotFoundException('Evenimentul nu a fost găsit.');
  return event;
}

const isPast = (e: Pick<Event, 'startsAt'>) => new Date(e.startsAt).getTime() <= Date.now();
