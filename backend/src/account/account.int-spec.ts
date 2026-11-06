import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import { DataSource, Repository } from 'typeorm';
import { clearTables, openTestDb } from '../test/int-db';
import { AccountService } from './account.service';
import { AuthService } from '../auth/auth.service';
import { TokensService } from '../auth/tokens.service';
import { SessionsService } from '../auth/sessions.service';
import { sessionFromToken } from '../auth/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { Notifications } from '../mail/notifications.service';
import { OutboxEmail } from '../mail/outbox.entity';
import { EventsService } from '../events/events.service';
import { Event } from '../events/event.entity';
import { ListEventsQuery } from '../events/dto/event.dto';
import { RegistrationsService } from '../registrations/registrations.service';
import { Registration } from '../registrations/registration.entity';
import { WaitlistService } from '../waitlist/waitlist.service';
import { WaitlistEntry } from '../waitlist/waitlist-entry.entity';
import { CoverService } from '../images/cover.service';
import { LocalImageStorage } from '../images/image-storage';

const H = 3_600_000;
const cfg = { appUrl: 'http://app.test', timeZone: 'Europe/Bucharest', from: 'x@test' };

describe('Profil, instrumente organizator, ștergerea contului (integrare)', () => {
  let ds: DataSource;
  let dir: string;
  let auth: AuthService;
  let account: AccountService;
  let events: EventsService;
  let registrations: RegistrationsService;
  let waitlist: WaitlistService;
  let covers: CoverService;
  let jwt: JwtService;
  let users: Repository<User>;
  let eventRepo: Repository<Event>;
  let outbox: Repository<OutboxEmail>;
  let n = 0;

  beforeAll(async () => {
    ds = await openTestDb();
    dir = await mkdtemp(join(tmpdir(), 'eventhub-account-'));
    users = ds.getRepository(User);
    eventRepo = ds.getRepository(Event);
    outbox = ds.getRepository(OutboxEmail);
    const notifications = new Notifications(cfg);
    jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: 900 } });
    auth = new AuthService(new UsersService(users), jwt, ds, new TokensService(), notifications, new SessionsService(ds));
    waitlist = new WaitlistService(ds, notifications);
    registrations = new RegistrationsService(ds, ds.getRepository(Registration), notifications, waitlist);
    events = new EventsService(eventRepo, ds.getRepository(Registration), ds, notifications, waitlist);
    covers = new CoverService(ds, new LocalImageStorage(dir));
    account = new AccountService(ds, auth, events, registrations, covers);
  });
  afterAll(async () => {
    await ds?.destroy();
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await clearTables(ds);
    await ds.query('TRUNCATE auth_tokens, refresh_tokens');
  });

  const signUp = async (role: 'PARTICIPANT' | 'ORGANIZER' = 'PARTICIPANT') => {
    if (role === 'ORGANIZER') process.env.ORGANIZER_INVITE_CODE = 'cod';
    const s = await auth.register({ name: `U${++n}`, email: `a${++n}@test.ro`, password: 'parola123', role, inviteCode: 'cod' }, 'UA');
    await users.update({ id: s.user.id }, { emailVerifiedAt: new Date() });
    return s;
  };
  const eventOf = (organizerId: string, over: Partial<Event> = {}) =>
    eventRepo.save(eventRepo.create({
      title: 'Eveniment', description: 'Descriere de test', location: 'Brașov', capacity: 1,
      startsAt: new Date(Date.now() + 48 * H), organizerId, ...over,
    }));

  describe('schimbarea parolei', () => {
    it('parola curentă greșită → 400 pe câmp; aceeași parolă → 400', async () => {
      const s = await signUp();
      await expect(auth.changePassword(s.user.id, 'gresita', 'parola-noua')).rejects.toThrow(BadRequestException);
      await expect(auth.changePassword(s.user.id, 'parola123', 'parola123')).rejects.toThrow('diferită');
    });

    it('închide celelalte sesiuni, dar dispozitivul curent primește o sesiune nouă', async () => {
      const s = await signUp();
      const phone = await auth.login({ email: s.user.email, password: 'parola123' }, 'Phone');
      const fresh = await auth.changePassword(s.user.id, 'parola123', 'parola-noua', 'Laptop');
      expect(await sessionFromToken(jwt, ds, phone.accessToken)).toBeNull();
      expect(await auth.refreshSession(phone.refresh.raw)).toBeNull();
      expect(await sessionFromToken(jwt, ds, fresh.accessToken)).toMatchObject({ id: s.user.id });
      expect(await auth.refreshSession(fresh.refresh.raw)).not.toBeNull();
      await expect(auth.login({ email: s.user.email, password: 'parola-noua' })).resolves.toBeDefined();
      expect(await outbox.count({ where: { kind: 'password-changed' } })).toBe(1);
    });
  });

  describe('ștergerea contului', () => {
    it('parola greșită → 400 și nimic șters', async () => {
      const s = await signUp();
      await expect(account.deleteAccount(s.user.id, 'gresita')).rejects.toThrow('Parola nu este corectă.');
      expect(await users.count({ where: { id: s.user.id } })).toBe(1);
    });

    it('participant: locul eliberat merge la lista de așteptare; organizatorul e anunțat, participantul nu', async () => {
      const org = await signUp('ORGANIZER');
      const e = await eventOf(org.user.id, { capacity: 1 });
      const [leaving, waiting] = [await signUp(), await signUp()];
      await registrations.register(leaving.user.id, e.id);
      await waitlist.join(waiting.user.id, e.id);
      await ds.query('DELETE FROM email_outbox');

      await account.deleteAccount(leaving.user.id, 'parola123');

      expect(await users.count({ where: { id: leaving.user.id } })).toBe(0);
      const regs = await ds.getRepository(Registration).find({ where: { eventId: e.id } });
      expect(regs.map((r) => r.userId)).toEqual([waiting.user.id]); // promovat, nu loc gol
      const mails = await outbox.find();
      expect(mails.some((m) => m.to === leaving.user.email && m.status === 'PENDING')).toBe(false);
      expect(mails.some((m) => m.kind === 'organizer-cancellation')).toBe(true);
      expect(mails.some((m) => m.kind === 'waitlist-promoted' && m.to === waiting.user.email)).toBe(true);
    });

    it('participant: iese și de pe listele de așteptare; înscrierile trecute dispar odată cu contul', async () => {
      const org = await signUp('ORGANIZER');
      const full = await eventOf(org.user.id, { capacity: 1 });
      await registrations.register((await signUp()).user.id, full.id);
      const p = await signUp();
      await waitlist.join(p.user.id, full.id);
      const past = await eventOf(org.user.id, { startsAt: new Date(Date.now() - 48 * H) });
      await ds.getRepository(Registration).insert({ userId: p.user.id, eventId: past.id });
      await account.deleteAccount(p.user.id, 'parola123');
      expect(await ds.getRepository(WaitlistEntry).count()).toBe(0);
      expect(await ds.getRepository(Registration).count({ where: { eventId: past.id } })).toBe(0);
    });

    it('organizator: evenimentele viitoare anunțate și șterse, cele trecute fără emailuri, copertele șterse de pe disc', async () => {
      const org = await signUp('ORGANIZER');
      const upcoming = await eventOf(org.user.id, { capacity: 5 });
      const past = await eventOf(org.user.id, { startsAt: new Date(Date.now() - 48 * H) });
      const p = await signUp();
      await registrations.register(p.user.id, upcoming.id);
      await ds.getRepository(Registration).insert({ userId: (await signUp()).user.id, eventId: past.id });
      const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#333' } }).jpeg().toBuffer();
      await covers.set(org.user.id, upcoming.id, jpg);
      await covers.set(org.user.id, past.id, jpg);
      expect(await readdir(dir)).toHaveLength(4);
      await ds.query('DELETE FROM email_outbox');

      await account.deleteAccount(org.user.id, 'parola123');

      expect(await eventRepo.count()).toBe(0);
      expect(await readdir(dir)).toEqual([]);
      const cancelled = await outbox.find({ where: { kind: 'event-cancelled' } });
      expect(cancelled.map((m) => m.to)).toEqual([p.user.email]); // doar evenimentul viitor
    });

    it('emailurile încă netrimise către adresa ștearsă dispar din coadă', async () => {
      const s = await signUp();
      expect(await outbox.count({ where: { to: s.user.email, status: 'PENDING' } })).toBeGreaterThan(0); // confirmarea emailului
      await account.deleteAccount(s.user.id, 'parola123');
      expect(await outbox.count({ where: { to: s.user.email } })).toBe(0);
    });
  });

  describe('instrumentele organizatorului', () => {
    it('CSV: înscrișii, apoi lista de așteptare, cu BOM și „;”, orele la București; alt organizator → 403', async () => {
      const org = await signUp('ORGANIZER');
      const e = await eventOf(org.user.id, { capacity: 1 });
      const [a, b] = [await signUp(), await signUp()];
      await users.update({ id: a.user.id }, { name: '=HYPERLINK("x")' });
      await registrations.register(a.user.id, e.id);
      await waitlist.join(b.user.id, e.id);
      await ds.query(`UPDATE registrations SET "createdAt" = '2026-12-01T17:00:00Z'`);
      const { csv } = await events.attendeesCsv(org.user.id, e.id, 'Europe/Bucharest');
      const lines = csv.replace('﻿', '').trim().split('\r\n');
      expect(csv.startsWith('﻿')).toBe(true);
      expect(lines[0]).toBe('Nr.;Nume;Email;Status;Data;Prezent');
      expect(lines[1]).toBe(`1;"'=HYPERLINK(""x"")";${a.user.email};Înscris;2026-12-01 19:00;Nu`);
      expect(lines[2]).toMatch(new RegExp(`^2;U\\d+;${b.user.email};Pe lista de așteptare \\(locul 1\\);`));
      const other = await signUp('ORGANIZER');
      await expect(events.attendeesCsv(other.user.id, e.id, 'Europe/Bucharest')).rejects.toThrow('Doar organizatorul');
    });

    it('statistici: ocupare, lista de așteptare, înscrieri pe zile la București (cu total cumulat)', async () => {
      const org = await signUp('ORGANIZER');
      const e = await eventOf(org.user.id, { capacity: 4 });
      const ps = [await signUp(), await signUp(), await signUp()];
      for (const p of ps) await registrations.register(p.user.id, e.id);
      const ids = (await ds.getRepository(Registration).find({ where: { eventId: e.id } })).map((r) => r.id);
      // 22:30 UTC = 00:30 a doua zi la București
      await ds.query(`UPDATE registrations SET "createdAt" = '2026-11-01T10:00:00Z' WHERE id = $1`, [ids[0]]);
      await ds.query(`UPDATE registrations SET "createdAt" = '2026-11-01T22:30:00Z' WHERE id = $1`, [ids[1]]);
      await ds.query(`UPDATE registrations SET "createdAt" = '2026-11-02T08:00:00Z' WHERE id = $1`, [ids[2]]);
      const s = await events.stats(org.user.id, e.id, 'Europe/Bucharest');
      expect(s).toMatchObject({ capacity: 4, registered: 3, waiting: 0, availableSeats: 1, occupancyPercent: 75 });
      expect(s.byDay).toEqual([
        { date: '2026-11-01', count: 1, cumulative: 1 },
        { date: '2026-11-02', count: 2, cumulative: 3 },
      ]);
    });

    it('arhiva: doar evenimentele începute, cele mai recente întâi, paginat', async () => {
      const org = await signUp('ORGANIZER');
      await eventOf(org.user.id, { title: 'Viitor' });
      await eventOf(org.user.id, { title: 'Ieri', startsAt: new Date(Date.now() - 24 * H) });
      await eventOf(org.user.id, { title: 'Luna trecută', startsAt: new Date(Date.now() - 30 * 24 * H) });
      const res = await events.findPast({ page: 1, limit: 20 } as ListEventsQuery);
      expect(res.total).toBe(2);
      expect(res.items.map((e) => e.title)).toEqual(['Ieri', 'Luna trecută']);
    });
  });
});
