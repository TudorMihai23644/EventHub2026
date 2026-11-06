import { ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { clearTables, openTestDb } from '../test/int-db';
import { Notifications } from './notifications.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { OutboxWorker } from './outbox.worker';
import { OutboxEmail } from './outbox.entity';
import { BatchResult, Mailer, MailerError, OutgoingEmail } from './mailer';
import { EventsService } from '../events/events.service';
import { Event } from '../events/event.entity';
import { RegistrationsService } from '../registrations/registrations.service';
import { Registration } from '../registrations/registration.entity';
import { Role, User } from '../users/user.entity';

const HOUR = 3_600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);
const cfg = { appUrl: 'http://app.test', timeZone: 'Europe/Bucharest', from: 'EventHub <x@test>' };

// Mailer fals: reține ce i s-a cerut să trimită și poate simula erori sau încetineală.
class FakeMailer extends Mailer {
  readonly name = 'fake';
  batches: OutgoingEmail[][] = [];
  keys: string[] = [];
  behaviour: (emails: OutgoingEmail[]) => Promise<BatchResult> = async () => ({ failed: [] });
  async sendBatch(emails: OutgoingEmail[], key: string) {
    this.batches.push(emails);
    this.keys.push(key);
    return this.behaviour(emails);
  }
}

describe('Emailuri: coadă + trimitere, pe PostgreSQL (integrare)', () => {
  let ds: DataSource;
  let users: Repository<User>;
  let events: Repository<Event>;
  let regs: Repository<Registration>;
  let outbox: Repository<OutboxEmail>;
  let notifications: Notifications;
  let registrations: RegistrationsService;
  let eventsService: EventsService;
  let n = 0;

  beforeAll(async () => {
    ds = await openTestDb();
    users = ds.getRepository(User);
    events = ds.getRepository(Event);
    regs = ds.getRepository(Registration);
    outbox = ds.getRepository(OutboxEmail);
    notifications = new Notifications(cfg);
    const waitlist = new WaitlistService(ds, notifications);
    registrations = new RegistrationsService(ds, regs, notifications, waitlist);
    eventsService = new EventsService(events, regs, ds, notifications, waitlist);
  });
  afterAll(() => ds?.destroy());
  beforeEach(() => clearTables(ds));

  const user = (role: Role, name = `Utilizator ${++n}`) =>
    users.save(users.create({ name, email: `u${++n}@test.ro`, passwordHash: 'x', role }));
  const event = (organizer: User, over: Partial<Event> = {}) =>
    events.save(events.create({
      title: 'Concert', description: 'Descriere de test', location: 'Brașov',
      capacity: 10, startsAt: inHours(48), organizerId: organizer.id, ...over,
    }));
  const queued = () => outbox.find({ order: { createdAt: 'ASC', kind: 'ASC' } });
  const owner = (u: User) => ({ id: u.id, role: 'ORGANIZER' as const });

  describe('ce se pune în coadă', () => {
    it('înscrierea: confirmare pentru participant + anunț pentru organizator', async () => {
      const org = await user('ORGANIZER', 'Maria');
      const p = await user('PARTICIPANT', 'Ana');
      const e = await event(org, { capacity: 5 });
      await registrations.register(p.id, e.id);

      const rows = await queued();
      expect(rows.map((r) => [r.kind, r.to]).sort()).toEqual([
        ['organizer-registration', org.email],
        ['registration-confirmed', p.email],
      ]);
      expect(rows.every((r) => r.status === 'PENDING')).toBe(true);
      expect(rows.find((r) => r.kind === 'organizer-registration')!.text).toContain('Locuri ocupate: 1 din 5');
    });

    it('înscrierea respinsă (eveniment plin): nimic în coadă', async () => {
      const org = await user('ORGANIZER');
      const [a, b] = [await user('PARTICIPANT'), await user('PARTICIPANT')];
      const e = await event(org, { capacity: 1 });
      await registrations.register(a.id, e.id);
      await clearOutbox();
      await expect(registrations.register(b.id, e.id)).rejects.toThrow(ConflictException);
      expect(await outbox.count()).toBe(0);
    });

    it('dacă tranzacția se anulează după ce emailurile au fost puse în coadă, ele dispar', async () => {
      const org = await user('ORGANIZER');
      const p = await user('PARTICIPANT');
      const e = await event(org);
      await expect(
        ds.transaction(async (m) => {
          await notifications.registrationCreated(m, { userId: p.id, event: e, taken: 1 });
          throw new Error('ceva a eșuat după');
        }),
      ).rejects.toThrow('ceva a eșuat după');
      expect(await outbox.count()).toBe(0);
    });

    it('anularea: confirmare pentru participant + anunț pentru organizator, cu locurile rămase', async () => {
      const org = await user('ORGANIZER');
      const p = await user('PARTICIPANT');
      const e = await event(org, { capacity: 3 });
      await registrations.register(p.id, e.id);
      await clearOutbox();
      await registrations.cancel(p.id, e.id);

      const rows = await queued();
      expect(rows.map((r) => r.kind).sort()).toEqual(['organizer-cancellation', 'registration-cancelled']);
      expect(rows.find((r) => r.kind === 'organizer-cancellation')!.text).toContain('Locuri ocupate: 0 din 3');
    });

    it('modificarea: doar capacitatea → nimic; data → câte un email per participant', async () => {
      const org = await user('ORGANIZER');
      const e = await event(org);
      const people = [await user('PARTICIPANT'), await user('PARTICIPANT')];
      for (const p of people) await registrations.register(p.id, e.id);
      await clearOutbox();

      await eventsService.update(owner(org), e.id, { capacity: 20, description: 'Altă descriere, mai lungă' });
      expect(await outbox.count()).toBe(0);

      await eventsService.update(owner(org), e.id, { startsAt: inHours(72).toISOString(), location: 'Cluj' });
      const rows = await queued();
      expect(rows.map((r) => r.to).sort()).toEqual(people.map((p) => p.email).sort());
      expect(rows.every((r) => r.kind === 'event-updated')).toBe(true);
      expect(rows[0].text).toContain('Unde: Brașov → Cluj');
    });

    it('ștergerea: anunță fiecare participant, apoi evenimentul și înscrierile dispar', async () => {
      const org = await user('ORGANIZER');
      const e = await event(org, { title: 'Festival' });
      const people = [await user('PARTICIPANT'), await user('PARTICIPANT'), await user('PARTICIPANT')];
      for (const p of people) await registrations.register(p.id, e.id);
      await clearOutbox();

      await eventsService.remove(org.id, e.id);

      const rows = await queued();
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.to).sort()).toEqual(people.map((p) => p.email).sort());
      expect(rows.every((r) => r.kind === 'event-cancelled' && r.subject === 'Evenimentul „Festival” a fost anulat')).toBe(true);
      expect(await events.count()).toBe(0);
      expect(await regs.count()).toBe(0);
    });
  });

  describe('OutboxWorker', () => {
    const seed = async (count: number) => {
      await outbox.insert(Array.from({ length: count }, (_, i) => ({ to: `p${i}@test.ro`, subject: `S${i}`, html: '<p>x</p>', text: 'x', kind: 'test' })));
    };

    it('trimite emailurile scadente într-un singur lot și le marchează SENT', async () => {
      await seed(3);
      const mailer = new FakeMailer();
      const worker = new OutboxWorker(ds, mailer);
      expect(await worker.processBatch()).toBe(3);
      expect(mailer.batches).toHaveLength(1);
      expect(mailer.batches[0].map((e) => e.to).sort()).toEqual(['p0@test.ro', 'p1@test.ro', 'p2@test.ro']);
      expect((await outbox.find()).every((r) => r.status === 'SENT' && r.sentAt)).toBe(true);
      expect(await worker.processBatch()).toBe(0); // nimic de trimis de două ori
    });

    it('eroare temporară: rămân PENDING și se reîncearcă doar după pauză', async () => {
      await seed(2);
      const mailer = new FakeMailer();
      mailer.behaviour = async () => { throw new MailerError('rate_limit_exceeded (429)', 30); };
      const worker = new OutboxWorker(ds, mailer);
      const t0 = await dbNow();
      await worker.processBatch(t0);
      const rows = await outbox.find();
      expect(rows.every((r) => r.status === 'PENDING' && r.attempts === 1 && r.lastError?.includes('429'))).toBe(true);

      mailer.behaviour = async () => ({ failed: [] });
      expect(await worker.processBatch(new Date(t0.getTime() + 30_000))).toBe(0); // încă nu e momentul (1 minut)
      expect(await worker.processBatch(new Date(t0.getTime() + 61_000))).toBe(2);
      expect((await outbox.find()).every((r) => r.status === 'SENT')).toBe(true);
    });

    it('o adresă respinsă devine FAILED, restul lotului se trimite', async () => {
      await seed(3);
      const mailer = new FakeMailer();
      mailer.behaviour = async () => ({ failed: [{ index: 1, error: 'Invalid `to` field.' }] });
      await new OutboxWorker(ds, mailer).processBatch();
      // indexul 1 = al doilea email din lotul trimis (ordinea din lot, nu ordinea în care au fost create)
      const rejected = mailer.batches[0][1].to;
      const rows = await outbox.find();
      expect(rows.find((r) => r.to === rejected)).toMatchObject({ status: 'FAILED', lastError: 'Invalid `to` field.' });
      expect(rows.filter((r) => r.to !== rejected).map((r) => r.status)).toEqual(['SENT', 'SENT']);
    });

    it('două worker-e simultan nu trimit niciodată același email (SKIP LOCKED)', async () => {
      await seed(150);
      const mailer = new FakeMailer();
      mailer.behaviour = async () => { await new Promise((r) => setTimeout(r, 400)); return { failed: [] }; };
      const [a, b] = [new OutboxWorker(ds, mailer), new OutboxWorker(ds, mailer)];
      const counts = await Promise.all([a.processBatch(), b.processBatch()]);

      expect(counts.sort((x, y) => x - y)).toEqual([50, 100]);
      const sent = mailer.batches.flat().map((e) => e.to);
      expect(sent).toHaveLength(150);
      expect(new Set(sent).size).toBe(150);
      expect(await outbox.count({ where: { status: 'SENT' } })).toBe(150);
    });

    it('același lot de emailuri primește aceeași cheie de idempotență la reîncercare', async () => {
      await seed(2);
      const mailer = new FakeMailer();
      mailer.behaviour = async () => { throw new MailerError('timeout'); };
      const worker = new OutboxWorker(ds, mailer);
      const t0 = await dbNow();
      await worker.processBatch(t0);
      mailer.behaviour = async () => ({ failed: [] });
      await worker.processBatch(new Date(t0.getTime() + 61_000));
      expect(mailer.keys).toHaveLength(2);
      expect(mailer.keys[0]).toBe(mailer.keys[1]);
    });
  });

  async function clearOutbox() {
    await ds.query('DELETE FROM email_outbox');
  }

  // Ora bazei de date (același ceas ca `sendAfter`), pentru a simula „peste un minut” fără să amestecăm ceasurile.
  /**
   * Ora bazei, rotunjită în SUS la milisecundă. PostgreSQL are microsecunde, un Date JS doar milisecunde: `now()` =
   * 10.123456 devine 10.123, deci un email scris în aceeași milisecundă (sendAfter = 10.123456) ar părea „din viitor”
   * și n-ar fi luat. Pe o mașină rapidă (CI) se întâmplă des. +1 ms acoperă orice fracțiune pierdută.
   */
  async function dbNow(): Promise<Date> {
    const now: Date = (await ds.query('SELECT now() AS now'))[0].now;
    return new Date(now.getTime() + 1);
  }
});
