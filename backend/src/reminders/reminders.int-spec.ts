import { DataSource, Repository } from 'typeorm';
import { clearTables, openTestDb } from '../test/int-db';
import { RemindersService } from './reminders.service';
import { Notifications } from '../mail/notifications.service';
import { OutboxEmail } from '../mail/outbox.entity';
import { Registration } from '../registrations/registration.entity';
import { Event } from '../events/event.entity';
import { EventsService } from '../events/events.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { WaitlistEntry } from '../waitlist/waitlist-entry.entity';
import { Role, User } from '../users/user.entity';

const cfg = { appUrl: 'http://app.test', apiUrl: 'http://api.test/api', timeZone: 'Europe/Bucharest', from: 'x@test' };

describe('Memento cu o zi înainte (integrare)', () => {
  let ds: DataSource;
  let reminders: RemindersService;
  let events: EventsService;
  let users: Repository<User>;
  let eventRepo: Repository<Event>;
  let regs: Repository<Registration>;
  let outbox: Repository<OutboxEmail>;
  let n = 0;

  beforeAll(async () => {
    ds = await openTestDb();
    users = ds.getRepository(User);
    eventRepo = ds.getRepository(Event);
    regs = ds.getRepository(Registration);
    outbox = ds.getRepository(OutboxEmail);
    const notifications = new Notifications(cfg);
    reminders = new RemindersService(ds, notifications);
    events = new EventsService(eventRepo, regs, ds, notifications, new WaitlistService(ds, notifications));
  });
  afterAll(() => ds?.destroy());
  beforeEach(() => clearTables(ds));

  const user = (role: Role = 'PARTICIPANT') =>
    users.save(users.create({ name: `U${++n}`, email: `r${++n}@test.ro`, passwordHash: 'x', role, emailVerifiedAt: new Date() }));
  /** Eveniment care începe peste `hours` ore (calculat în baza de date). */
  const eventIn = async (hours: number, capacity = 50) => {
    const org = await user('ORGANIZER');
    const e = await eventRepo.save(eventRepo.create({
      title: 'Concert', description: 'Descriere de test', location: 'Brașov', capacity, startsAt: new Date(), organizerId: org.id,
    }));
    await ds.query(`UPDATE events SET "startsAt" = now() + make_interval(secs => $2) WHERE id = $1`, [e.id, hours * 3600]);
    return { org, e: await eventRepo.findOneByOrFail({ id: e.id }) };
  };
  /** Înscriere făcută acum `hoursAgo` ore. */
  const registeredAgo = async (e: Event, hoursAgo: number, u?: User) => {
    const p = u ?? (await user());
    const r = await regs.save(regs.create({ userId: p.id, eventId: e.id }));
    await ds.query(`UPDATE registrations SET "createdAt" = now() - make_interval(secs => $2) WHERE id = $1`, [r.id, hoursAgo * 3600]);
    return p;
  };
  const moveEvent = (e: Event, hours: number) =>
    ds.query(`UPDATE events SET "startsAt" = now() + make_interval(secs => $2) WHERE id = $1`, [e.id, hours * 3600]);
  const remindedEmails = async () => (await outbox.find({ where: { kind: 'event-reminder' } })).map((m) => m.to).sort();

  it('înainte de fereastra de 24 de ore: nimic; în fereastră: o singură dată', async () => {
    const { e } = await eventIn(72);
    const p = await registeredAgo(e, 100);
    expect(await reminders.run()).toBe(0);

    await moveEvent(e, 20);
    expect(await reminders.run()).toBe(1);
    expect(await remindedEmails()).toEqual([p.email]);
    expect((await regs.findOneByOrFail({ userId: p.id })).reminderSentAt).toBeInstanceOf(Date);
    expect(await reminders.run()).toBe(0); // a doua rulare nu mai trimite
  });

  it('conținutul: „Mâine/Astăzi/Începe în curând”, linkuri de calendar', async () => {
    const { e } = await eventIn(20);
    await registeredAgo(e, 100);
    await reminders.run();
    const [mail] = await outbox.find({ where: { kind: 'event-reminder' } });
    expect(mail.subject).toMatch(/^(Mâine|Astăzi|Începe în curând): „Concert”$/);
    expect(mail.text).toContain(`http://api.test/api/events/${e.id}/calendar.ics`);
    expect(mail.text).toContain('https://calendar.google.com/calendar/render?');
  });

  it('înscris cu câteva ore înainte (în fereastră): fără memento', async () => {
    const { e } = await eventIn(20);
    await registeredAgo(e, 2); // s-a înscris la 22h înainte de început: confirmarea e proaspătă
    expect(await reminders.run()).toBe(0);
  });

  it('cei de pe lista de așteptare nu primesc memento; îndemnul pomenește lista', async () => {
    const { e } = await eventIn(20, 1);
    const p = await registeredAgo(e, 100);
    const waiting = await user();
    await ds.getRepository(WaitlistEntry).insert({ userId: waiting.id, eventId: e.id });
    await reminders.run();
    expect(await remindedEmails()).toEqual([p.email]);
    expect((await outbox.findOneByOrFail({ kind: 'event-reminder' })).text).toContain('lista de așteptare');
  });

  it('evenimentul a început deja: fără memento', async () => {
    const { e } = await eventIn(-1);
    await registeredAgo(e, 100);
    expect(await reminders.run()).toBe(0);
  });

  it('data mutată după memento: se trimite din nou, pentru noua dată', async () => {
    const { org, e } = await eventIn(20);
    const p = await registeredAgo(e, 100);
    await reminders.run();
    await events.update({ id: org.id, role: 'ORGANIZER' }, e.id, { startsAt: new Date(Date.now() + 23 * 3_600_000).toISOString() });
    expect((await regs.findOneByOrFail({ userId: p.id })).reminderSentAt).toBeNull();
    // înscrierea e de acum 100 de ore, deci tot dinaintea noii ferestre
    expect(await reminders.run()).toBe(1);
    expect(await remindedEmails()).toEqual([p.email, p.email]);
  });

  it('alte modificări (titlu, capacitate) nu retrimit memento-ul', async () => {
    const { org, e } = await eventIn(20);
    await registeredAgo(e, 100);
    await reminders.run();
    await events.update({ id: org.id, role: 'ORGANIZER' }, e.id, { title: 'Concert nou', capacity: 60 });
    expect(await reminders.run()).toBe(0);
  });

  it('două rulări în același timp: fiecare om primește exact un memento', async () => {
    const { e } = await eventIn(20);
    for (let i = 0; i < 30; i++) await registeredAgo(e, 100);
    const counts = await Promise.all([reminders.run(), reminders.run()]);
    expect(counts[0] + counts[1]).toBe(30);
    const sent = await remindedEmails();
    expect(sent).toHaveLength(30);
    expect(new Set(sent).size).toBe(30);
  });
});
