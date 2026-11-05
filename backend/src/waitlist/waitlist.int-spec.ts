import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { clearTables, openTestDb } from '../test/int-db';
import { WaitlistService } from './waitlist.service';
import { WaitlistEntry } from './waitlist-entry.entity';
import { Notifications } from '../mail/notifications.service';
import { OutboxEmail } from '../mail/outbox.entity';
import { RegistrationsService } from '../registrations/registrations.service';
import { Registration } from '../registrations/registration.entity';
import { EventsService } from '../events/events.service';
import { Event } from '../events/event.entity';
import { Role, User } from '../users/user.entity';

const HOUR = 3_600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);
const cfg = { appUrl: 'http://app.test', timeZone: 'Europe/Bucharest', from: 'x@test' };

describe('Lista de așteptare (integrare)', () => {
  let ds: DataSource;
  let waitlist: WaitlistService;
  let registrations: RegistrationsService;
  let events: EventsService;
  let users: Repository<User>;
  let eventRepo: Repository<Event>;
  let regs: Repository<Registration>;
  let entries: Repository<WaitlistEntry>;
  let outbox: Repository<OutboxEmail>;
  let n = 0;

  beforeAll(async () => {
    ds = await openTestDb();
    users = ds.getRepository(User);
    eventRepo = ds.getRepository(Event);
    regs = ds.getRepository(Registration);
    entries = ds.getRepository(WaitlistEntry);
    outbox = ds.getRepository(OutboxEmail);
    const notifications = new Notifications(cfg);
    waitlist = new WaitlistService(ds, notifications);
    registrations = new RegistrationsService(ds, regs, notifications, waitlist);
    events = new EventsService(eventRepo, regs, ds, notifications, waitlist);
  });
  afterAll(() => ds?.destroy());
  beforeEach(() => clearTables(ds));

  const user = (role: Role = 'PARTICIPANT', name = `P${++n}`) =>
    users.save(users.create({ name, email: `w${++n}@test.ro`, passwordHash: 'x', role, emailVerifiedAt: new Date() }));
  const people = async (k: number) => { const out: User[] = []; for (let i = 0; i < k; i++) out.push(await user()); return out; };
  const event = async (organizer: User, capacity: number, over: Partial<Event> = {}) =>
    eventRepo.save(eventRepo.create({
      title: 'Concert', description: 'Descriere de test', location: 'Brașov', capacity, startsAt: inHours(48), organizerId: organizer.id, ...over,
    }));
  /** Un eveniment plin: `capacity` înscriși deja. */
  const fullEvent = async (capacity: number) => {
    const org = await user('ORGANIZER', 'Maria');
    const e = await event(org, capacity);
    const inside = await people(capacity);
    for (const p of inside) await registrations.register(p.id, e.id);
    await ds.query('DELETE FROM email_outbox');
    return { org, e, inside };
  };
  const queue = async (eventId: string) => (await entries.find({ where: { eventId }, order: { createdAt: 'ASC', id: 'ASC' } })).map((w) => w.userId);
  const registered = async (eventId: string) => (await regs.find({ where: { eventId } })).map((r) => r.userId).sort();
  /** Invariantul: cât timp cineva așteaptă, nu există locuri libere. */
  const assertInvariant = async (e: Event) => {
    const fresh = await eventRepo.findOneByOrFail({ id: e.id });
    const taken = await regs.count({ where: { eventId: e.id } });
    const waiting = await entries.count({ where: { eventId: e.id } });
    expect(taken).toBeLessThanOrEqual(fresh.capacity);
    if (waiting > 0) expect(taken).toBe(fresh.capacity);
  };

  describe('intrarea pe listă', () => {
    it('doar când evenimentul este plin; locurile vin în ordinea sosirii', async () => {
      const { e } = await fullEvent(1);
      const [a, b, c] = await people(3);
      expect(await waitlist.join(a.id, e.id)).toEqual({ position: 1, waitlistCount: 1 });
      expect(await waitlist.join(b.id, e.id)).toEqual({ position: 2, waitlistCount: 2 });
      expect(await waitlist.join(c.id, e.id)).toEqual({ position: 3, waitlistCount: 3 });
      expect(await queue(e.id)).toEqual([a.id, b.id, c.id]);
      expect(await outbox.count({ where: { kind: 'waitlist-joined' } })).toBe(3);
    });

    it('cu locuri libere: 409 SEATS_AVAILABLE', async () => {
      const org = await user('ORGANIZER');
      const e = await event(org, 5);
      const p = await user();
      await expect(waitlist.join(p.id, e.id)).rejects.toThrow('Mai sunt locuri');
    });

    it('nu de două ori, nu dacă ești înscris, nu la evenimente trecute', async () => {
      const { e, inside } = await fullEvent(1);
      const p = await user();
      await waitlist.join(p.id, e.id);
      await expect(waitlist.join(p.id, e.id)).rejects.toThrow('deja pe lista');
      await expect(waitlist.join(inside[0].id, e.id)).rejects.toThrow(ConflictException);
      const past = await event(await user('ORGANIZER'), 1, { startsAt: inHours(-1) });
      await expect(waitlist.join(p.id, past.id)).rejects.toThrow(BadRequestException);
      await expect(waitlist.join(p.id, '00000000-0000-0000-0000-000000000000')).rejects.toThrow(NotFoundException);
    });

    it('ieșirea de pe listă îi mută pe ceilalți cu un loc mai în față', async () => {
      const { e } = await fullEvent(1);
      const [a, b, c] = await people(3);
      for (const p of [a, b, c]) await waitlist.join(p.id, e.id);
      await waitlist.leave(a.id, e.id);
      expect([...(await waitlist.positions(b.id, [e.id])).values(), ...(await waitlist.positions(c.id, [e.id])).values()]).toEqual([1, 2]);
      await expect(waitlist.leave(a.id, e.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('promovarea', () => {
    it('o anulare îl înscrie automat pe primul de pe listă, cu emailurile lui și ale organizatorului', async () => {
      const { e, inside } = await fullEvent(2);
      const [a, b] = await people(2);
      await waitlist.join(a.id, e.id);
      await waitlist.join(b.id, e.id);
      await ds.query('DELETE FROM email_outbox');

      await registrations.cancel(inside[0].id, e.id);

      expect(await registered(e.id)).toEqual([inside[1].id, a.id].sort());
      expect(await queue(e.id)).toEqual([b.id]);
      const mails = await outbox.find();
      expect(mails.find((m) => m.kind === 'waitlist-promoted')).toMatchObject({ to: a.email, subject: 'Ai primit un loc la „Concert”' });
      const org = mails.find((m) => m.kind === 'organizer-registration')!;
      expect(org.subject).toContain('(de pe lista de așteptare)');
      expect(org.text).toContain('Locuri ocupate: 2 din 2');
      await assertInvariant(e);
    });

    it('capacitatea mărită cu 3 și 5 oameni pe listă: exact primii 3 sunt înscriși', async () => {
      const { org, e } = await fullEvent(1);
      const waiting = await people(5);
      for (const p of waiting) await waitlist.join(p.id, e.id);
      await events.update({ id: org.id, role: 'ORGANIZER' }, e.id, { capacity: 4 });
      expect(await queue(e.id)).toEqual(waiting.slice(3).map((p) => p.id));
      expect(await regs.count({ where: { eventId: e.id } })).toBe(4);
      expect(await outbox.count({ where: { kind: 'waitlist-promoted' } })).toBe(3);
      await assertInvariant(e);
    });

    it('două anulări în același moment: două persoane diferite promovate, niciodată peste capacitate', async () => {
      const { e, inside } = await fullEvent(3);
      const waiting = await people(4);
      for (const p of waiting) await waitlist.join(p.id, e.id);
      await Promise.all([registrations.cancel(inside[0].id, e.id), registrations.cancel(inside[1].id, e.id)]);
      expect(await registered(e.id)).toEqual([inside[2].id, waiting[0].id, waiting[1].id].sort());
      expect(await queue(e.id)).toEqual([waiting[2].id, waiting[3].id]);
      await assertInvariant(e);
    });

    it('o intrare pe listă și o anulare în același moment: invariantul se păstrează', async () => {
      for (let round = 0; round < 5; round++) {
        await clearTables(ds);
        const { e, inside } = await fullEvent(1);
        const p = await user();
        const [joined] = await Promise.allSettled([waitlist.join(p.id, e.id), registrations.cancel(inside[0].id, e.id)]);
        // fie a intrat pe listă înainte de anulare (și a fost promovat), fie a găsit locul liber (409 SEATS_AVAILABLE)
        if (joined.status === 'fulfilled') expect(await registered(e.id)).toEqual([p.id]);
        else expect(String(joined.reason)).toContain('Mai sunt locuri');
        await assertInvariant(e);
      }
    });

    it('după începerea evenimentului nu se mai promovează nimeni', async () => {
      const { org, e } = await fullEvent(1);
      const p = await user();
      await waitlist.join(p.id, e.id);
      await ds.query(`UPDATE events SET "startsAt" = now() - interval '1 hour' WHERE id = $1`, [e.id]);
      await events.update({ id: org.id, role: 'ORGANIZER' }, e.id, { capacity: 3 });
      expect(await queue(e.id)).toEqual([p.id]);
      expect(await regs.count({ where: { eventId: e.id } })).toBe(1);
    });
  });

  describe('ce vede fiecare', () => {
    it('participantul: locul lui; organizatorul: lista în ordine și totalul din rezumat', async () => {
      const { org, e } = await fullEvent(1);
      const [a, b] = await people(2);
      await waitlist.join(a.id, e.id);
      await waitlist.join(b.id, e.id);

      expect(await events.findOne(e.id, { id: b.id, role: 'PARTICIPANT', emailVerified: true })).toMatchObject({
        status: 'FULL', isWaitlisted: true, waitlistPosition: 2, waitlistCount: 2, canLeaveWaitlist: true, canJoinWaitlist: false,
      });
      expect((await waitlist.mine(b.id))[0]).toMatchObject({ position: 2, waitlistCount: 2, canLeave: true, event: { id: e.id } });
      expect((await waitlist.listForOwner(org.id, e.id)).map((w) => [w.position, w.user.id])).toEqual([[1, a.id], [2, b.id]]);
      await expect(waitlist.listForOwner((await user('ORGANIZER')).id, e.id)).rejects.toThrow(ForbiddenException);
      expect(await events.summary(org.id)).toMatchObject({ eventsCount: 1, totalRegistrations: 1, totalWaiting: 2 });
    });
  });

  describe('modificarea și ștergerea evenimentului', () => {
    it('cei de pe listă primesc emailul de modificare, cu textul pentru listă', async () => {
      const { org, e } = await fullEvent(1);
      const p = await user();
      await waitlist.join(p.id, e.id);
      await ds.query('DELETE FROM email_outbox');
      await events.update({ id: org.id, role: 'ORGANIZER' }, e.id, { location: 'Cluj' });
      const mail = await outbox.findOneByOrFail({ to: p.email });
      expect(mail.kind).toBe('event-updated');
      expect(mail.text).toContain('ești pe lista de așteptare');
    });

    it('ștergerea anunță și lista de așteptare, apoi o șterge', async () => {
      const { org, e, inside } = await fullEvent(1);
      const p = await user();
      await waitlist.join(p.id, e.id);
      await ds.query('DELETE FROM email_outbox');
      await events.remove(org.id, e.id);
      const mails = await outbox.find({ where: { kind: 'event-cancelled' } });
      expect(mails.map((m) => m.to).sort()).toEqual([inside[0].email, p.email].sort());
      expect(mails.find((m) => m.to === p.email)!.text).toContain('erai pe lista de așteptare');
      expect(await entries.count()).toBe(0);
    });
  });
});
