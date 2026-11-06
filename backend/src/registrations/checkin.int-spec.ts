import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { clearTables, openTestDb } from '../test/int-db';
import { CheckinService } from './checkin.service';
import { RegistrationsService } from './registrations.service';
import { Registration } from './registration.entity';
import { WaitlistService } from '../waitlist/waitlist.service';
import { Notifications } from '../mail/notifications.service';
import { OutboxEmail } from '../mail/outbox.entity';
import { EventsService } from '../events/events.service';
import { Event } from '../events/event.entity';
import { Role, User } from '../users/user.entity';

const H = 3_600_000;
const cfg = { appUrl: 'http://app.test', timeZone: 'Europe/Bucharest', from: 'x@test' };

describe('Bilete și validare la intrare (integrare)', () => {
  let ds: DataSource;
  let checkin: CheckinService;
  let registrations: RegistrationsService;
  let waitlist: WaitlistService;
  let events: EventsService;
  let regs: Repository<Registration>;
  let eventRepo: Repository<Event>;
  let users: Repository<User>;
  let org: User;
  let n = 0;

  beforeAll(async () => {
    ds = await openTestDb();
    regs = ds.getRepository(Registration);
    eventRepo = ds.getRepository(Event);
    users = ds.getRepository(User);
    const notifications = new Notifications(cfg);
    waitlist = new WaitlistService(ds, notifications);
    registrations = new RegistrationsService(ds, regs, notifications, waitlist);
    events = new EventsService(eventRepo, regs, ds, notifications, waitlist);
    checkin = new CheckinService(ds);
  });
  afterAll(() => ds?.destroy());
  beforeEach(async () => {
    await clearTables(ds);
    org = await user('ORGANIZER');
  });

  const user = (role: Role = 'PARTICIPANT') =>
    users.save(users.create({ name: `U${++n}`, email: `k${++n}@test.ro`, passwordHash: 'x', role, emailVerifiedAt: new Date() }));
  /** Eveniment care începe peste `hours` ore (negativ = a început). */
  const eventIn = (hours: number, over: Partial<Event> = {}) =>
    eventRepo.save(eventRepo.create({ title: 'Concert', description: 'Descriere de test', location: 'Brașov', capacity: 10, startsAt: new Date(Date.now() + hours * H), organizerId: org.id, ...over }));
  const registerAt = async (e: Event) => {
    // înscriere directă: evenimentul poate fi deja început (validarea se face în timpul lui)
    const p = await user();
    await regs.insert({ userId: p.id, eventId: e.id });
    return { p, reg: await regs.findOneByOrFail({ userId: p.id, eventId: e.id }) };
  };

  it('fiecare înscriere primește un cod unic de 10 caractere, generat de baza de date', async () => {
    const e = await eventIn(1);
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) codes.add((await registerAt(e)).reg.ticketCode);
    expect(codes.size).toBe(50);
    for (const c of codes) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
  });

  it('și cei promovați de pe lista de așteptare (inserați altfel) primesc cod', async () => {
    const e = await eventIn(48, { capacity: 1 });
    const [a, b] = [await user(), await user()];
    await registrations.register(a.id, e.id);
    await waitlist.join(b.id, e.id);
    await registrations.cancel(a.id, e.id);
    expect((await regs.findOneByOrFail({ userId: b.id, eventId: e.id })).ticketCode).toHaveLength(10);
  });

  it('scanare: prima dată CHECKED_IN, a doua oară ALREADY_CHECKED_IN, cu aceeași oră', async () => {
    const e = await eventIn(-0.5);
    const { p, reg } = await registerAt(e);
    const first = await checkin.scan(org.id, reg.ticketCode.toLowerCase());
    expect(first).toMatchObject({ result: 'CHECKED_IN', participant: { name: p.name }, event: { id: e.id } });
    const second = await checkin.scan(org.id, `${reg.ticketCode.slice(0, 5)}-${reg.ticketCode.slice(5)}`);
    expect(second.result).toBe('ALREADY_CHECKED_IN');
    expect(second.checkedInAt).toEqual(first.checkedInAt);
  });

  it('două scanări simultane ale aceluiași bilet: exact o validare', async () => {
    const e = await eventIn(-0.5);
    const { reg } = await registerAt(e);
    const results = await Promise.all([checkin.scan(org.id, reg.ticketCode), checkin.scan(org.id, reg.ticketCode), checkin.scan(org.id, reg.ticketCode)]);
    expect(results.map((r) => r.result).sort()).toEqual(['ALREADY_CHECKED_IN', 'ALREADY_CHECKED_IN', 'CHECKED_IN']);
  });

  it('biletul altui organizator arată ca un cod inexistent (404)', async () => {
    const e = await eventIn(-0.5);
    const { reg } = await registerAt(e);
    const other = await user('ORGANIZER');
    await expect(checkin.scan(other.id, reg.ticketCode)).rejects.toThrow(NotFoundException);
    await expect(checkin.scan(org.id, '0000000000')).rejects.toThrow('Bilet necunoscut');
    await expect(checkin.scan(org.id, 'nu-e-cod')).rejects.toThrow(BadRequestException);
  });

  it('în afara ferestrei: prea devreme sau prea târziu → 400, nimic marcat', async () => {
    const early = await eventIn(5);
    const a = await registerAt(early);
    await expect(checkin.scan(org.id, a.reg.ticketCode)).rejects.toThrow('începe cu 3 ore');
    const late = await eventIn(-30, { endsAt: new Date(Date.now() - 20 * H) });
    const b = await registerAt(late);
    await expect(checkin.scan(org.id, b.reg.ticketCode)).rejects.toThrow('s-a încheiat');
    expect(await regs.count({ where: { checkedInAt: undefined } })).toBe(2);
    expect((await regs.find()).every((r) => r.checkedInAt === null)).toBe(true);
  });

  it('marcare manuală: prezent / absent; corecturi și după eveniment; alt organizator → 403', async () => {
    const e = await eventIn(-30, { endsAt: new Date(Date.now() - 20 * H) });
    const { reg } = await registerAt(e);
    expect((await checkin.setAttendance(org.id, e.id, reg.id, true)).checkedInAt).toBeInstanceOf(Date);
    expect((await checkin.setAttendance(org.id, e.id, reg.id, false)).checkedInAt).toBeNull();
    await expect(checkin.setAttendance((await user('ORGANIZER')).id, e.id, reg.id, true)).rejects.toThrow(ForbiddenException);
  });

  it('statistici: prezenți și absenți după început; înainte, absenții sunt null', async () => {
    const future = await eventIn(24);
    await registerAt(future);
    expect(await events.stats(org.id, future.id, cfg.timeZone)).toMatchObject({ checkedIn: 0, noShow: null, noShowPercent: null });

    const e = await eventIn(-1);
    const regsOf = [await registerAt(e), await registerAt(e), await registerAt(e), await registerAt(e)];
    await checkin.scan(org.id, regsOf[0].reg.ticketCode);
    await checkin.scan(org.id, regsOf[1].reg.ticketCode);
    await checkin.scan(org.id, regsOf[2].reg.ticketCode);
    expect(await events.stats(org.id, e.id, cfg.timeZone)).toMatchObject({ registered: 4, checkedIn: 3, noShow: 1, noShowPercent: 25 });
  });

  it('biletul apare doar pentru participantul înscris; CSV are coloana „Prezent”', async () => {
    const e = await eventIn(-0.5);
    const { p, reg } = await registerAt(e);
    const other = await user();
    expect((await events.findOne(e.id, { id: p.id, role: 'PARTICIPANT', emailVerified: true })).ticket).toMatchObject({ code: reg.ticketCode });
    expect((await events.findOne(e.id, { id: other.id, role: 'PARTICIPANT', emailVerified: true })).ticket).toBeNull();
    expect((await events.findOne(e.id, { id: org.id, role: 'ORGANIZER' })).ticket).toBeNull();
    expect(JSON.stringify(await events.findOne(e.id))).not.toContain(reg.ticketCode);
    await checkin.scan(org.id, reg.ticketCode);
    const { csv } = await events.attendeesCsv(org.id, e.id, cfg.timeZone);
    expect(csv).toContain(';Prezent\r\n');
    expect(csv).toMatch(/;Înscris;[^;]+;Da \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}\)\r\n/);
  });

  it('emailul de confirmare conține codul biletului', async () => {
    const e = await eventIn(48);
    const p = await user();
    await registrations.register(p.id, e.id);
    const reg = await regs.findOneByOrFail({ userId: p.id, eventId: e.id });
    const mail = await ds.getRepository(OutboxEmail).findOneByOrFail({ kind: 'registration-confirmed' });
    expect(mail.text).toContain(`Bilet: ${reg.ticketCode.slice(0, 5)}-${reg.ticketCode.slice(5)}`);
  });
});
