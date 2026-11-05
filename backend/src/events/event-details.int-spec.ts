import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { clearTables, openTestDb } from '../test/int-db';
import { EventsService } from './events.service';
import { Event } from './event.entity';
import { CreateEventDto, ListEventsQuery } from './dto/event.dto';
import { Registration } from '../registrations/registration.entity';
import { RegistrationsService } from '../registrations/registrations.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { Notifications } from '../mail/notifications.service';
import { OutboxEmail } from '../mail/outbox.entity';
import { Role, User } from '../users/user.entity';

const H = 3_600_000;
const cfg = { appUrl: 'http://app.test', apiUrl: 'http://api.test/api', timeZone: 'Europe/Bucharest', from: 'x@test' };

describe('Ora de sfârșit, categorie, online (integrare)', () => {
  let ds: DataSource;
  let events: EventsService;
  let registrations: RegistrationsService;
  let users: Repository<User>;
  let outbox: Repository<OutboxEmail>;
  let org: User;
  let n = 0;

  beforeAll(async () => {
    ds = await openTestDb();
    users = ds.getRepository(User);
    outbox = ds.getRepository(OutboxEmail);
    const eventRepo = ds.getRepository(Event);
    const regs = ds.getRepository(Registration);
    const notifications = new Notifications(cfg);
    const waitlist = new WaitlistService(ds, notifications);
    events = new EventsService(eventRepo, regs, ds, notifications, waitlist);
    registrations = new RegistrationsService(ds, regs, notifications, waitlist);
  });
  afterAll(() => ds?.destroy());
  beforeEach(async () => {
    await clearTables(ds);
    org = await user('ORGANIZER');
  });

  const user = (role: Role = 'PARTICIPANT') =>
    users.save(users.create({ name: `U${++n}`, email: `d${++n}@test.ro`, passwordHash: 'x', role, emailVerifiedAt: new Date() }));
  const owner = () => ({ id: org.id, role: 'ORGANIZER' as const });
  const base = (over: Partial<CreateEventDto> = {}): CreateEventDto => ({
    title: 'Eveniment', description: 'Descriere de test', capacity: 10, category: 'ATELIER',
    startsAt: new Date(Date.now() + 48 * H).toISOString(), location: 'Brașov', ...over,
  });
  const create = (over: Partial<CreateEventDto> = {}) => events.create(owner(), base(over));
  const fieldOf = async (p: Promise<unknown>) => {
    const e = await p.then(() => null, (err) => err);
    expect(e).toBeInstanceOf(BadRequestException);
    return Object.keys((e as BadRequestException).getResponse() as any).includes('fields')
      ? Object.keys(((e as BadRequestException).getResponse() as any).fields)[0]
      : null;
  };

  describe('reguli pe format', () => {
    it('fizic: locație obligatorie; un link trimis nu se păstrează', async () => {
      expect(await fieldOf(create({ location: undefined }))).toBe('location');
      const e = await create({ onlineUrl: 'https://meet.example.ro/x' });
      expect(e).toMatchObject({ format: 'PHYSICAL', onlineUrl: null, place: 'Brașov' });
    });

    it('online: link obligatoriu; locația devine „Online”', async () => {
      expect(await fieldOf(create({ format: 'ONLINE', location: undefined }))).toBe('onlineUrl');
      const e = await create({ format: 'ONLINE', location: undefined, onlineUrl: 'https://meet.example.ro/x' });
      expect(e).toMatchObject({ format: 'ONLINE', location: 'Online', place: 'Online', onlineUrl: 'https://meet.example.ro/x' });
    });

    it('hibrid: locație și link, amândouă obligatorii', async () => {
      expect(await fieldOf(create({ format: 'HYBRID' }))).toBe('onlineUrl');
      expect(await fieldOf(create({ format: 'HYBRID', location: undefined, onlineUrl: 'https://m.ro/x' }))).toBe('location');
      expect(await create({ format: 'HYBRID', onlineUrl: 'https://m.ro/x' })).toMatchObject({ place: 'Brașov și online' });
    });

    it('editare: din online în fizic cere o locație reală (nu „Online” rămas)', async () => {
      const e = await create({ format: 'ONLINE', location: undefined, onlineUrl: 'https://m.ro/x' });
      expect(await fieldOf(events.update(owner(), e.id, { format: 'PHYSICAL' }))).toBe('location');
      const fixed = await events.update(owner(), e.id, { format: 'PHYSICAL', location: 'Cluj' });
      expect(fixed).toMatchObject({ format: 'PHYSICAL', location: 'Cluj', onlineUrl: null });
    });

    it('editare: doar formatul online, fără link salvat → cere linkul', async () => {
      const e = await create();
      expect(await fieldOf(events.update(owner(), e.id, { format: 'ONLINE' }))).toBe('onlineUrl');
    });
  });

  describe('ora de sfârșit', () => {
    it('trebuie să fie după început și în cel mult 14 zile', async () => {
      const start = Date.now() + 48 * H;
      expect(await fieldOf(create({ startsAt: new Date(start).toISOString(), endsAt: new Date(start - H).toISOString() }))).toBe('endsAt');
      expect(await fieldOf(create({ startsAt: new Date(start).toISOString(), endsAt: new Date(start + 15 * 24 * H).toISOString() }))).toBe('endsAt');
      const ok = await create({ startsAt: new Date(start).toISOString(), endsAt: new Date(start + 3 * H).toISOString() });
      expect(new Date(ok.endsAt!).getTime() - new Date(ok.startsAt).getTime()).toBe(3 * H);
    });

    it('mutarea doar a începutului mută și sfârșitul (durata rămâne)', async () => {
      const start = Date.now() + 48 * H;
      const e = await create({ startsAt: new Date(start).toISOString(), endsAt: new Date(start + 2.5 * H).toISOString() });
      const moved = await events.update(owner(), e.id, { startsAt: new Date(start + 24 * H).toISOString() });
      expect(new Date(moved.endsAt!).getTime() - new Date(moved.startsAt).getTime()).toBe(2.5 * H);
    });

    it('null șterge ora de sfârșit', async () => {
      const start = Date.now() + 48 * H;
      const e = await create({ startsAt: new Date(start).toISOString(), endsAt: new Date(start + H).toISOString() });
      expect((await events.update(owner(), e.id, { endsAt: null })).endsAt).toBeNull();
    });
  });

  describe('categoria', () => {
    it('filtrul pe categorie lucrează cu paginarea și totalul', async () => {
      for (let i = 0; i < 5; i++) await create({ category: 'SPORT', startsAt: new Date(Date.now() + (24 + i) * H).toISOString() });
      for (let i = 0; i < 3; i++) await create({ category: 'CONCERT' });
      const q = { page: 1, limit: 2, category: 'SPORT' } as ListEventsQuery;
      const res = await events.findUpcoming(q);
      expect(res).toMatchObject({ total: 5, totalPages: 3 });
      expect(res.items.every((e) => e.category === 'SPORT' && e.categoryLabel === 'Sport')).toBe(true);
      expect((await events.findUpcoming({ page: 1, limit: 20 } as ListEventsQuery)).total).toBe(8);
    });
  });

  describe('linkul online', () => {
    it('lista publică și participanții neînscriși nu primesc linkul; cel înscris îl primește, și pe email', async () => {
      const e = await create({ format: 'ONLINE', location: undefined, onlineUrl: 'https://meet.example.ro/secret' });
      const [a, b] = [await user(), await user()];
      await registrations.register(a.id, e.id);

      const list = await events.findUpcoming({ page: 1, limit: 20 } as ListEventsQuery);
      expect(JSON.stringify(list)).not.toContain('meet.example.ro');
      expect(JSON.stringify(await events.findOne(e.id, { id: b.id, role: 'PARTICIPANT', emailVerified: true }))).not.toContain('meet.example.ro');
      expect((await events.findOne(e.id, { id: a.id, role: 'PARTICIPANT', emailVerified: true })).onlineUrl).toBe('https://meet.example.ro/secret');

      const confirmation = await outbox.findOneByOrFail({ kind: 'registration-confirmed' });
      expect(confirmation.text).toContain('Link online: https://meet.example.ro/secret');
      const organizerMail = await outbox.findOneByOrFail({ kind: 'organizer-registration' });
      expect(organizerMail.text).not.toContain('meet.example.ro');
    });

    it('link schimbat: cei înscriși primesc linkul nou pe email', async () => {
      const e = await create({ format: 'ONLINE', location: undefined, onlineUrl: 'https://meet.example.ro/vechi' });
      const a = await user();
      await registrations.register(a.id, e.id);
      await ds.query('DELETE FROM email_outbox');
      await events.update(owner(), e.id, { onlineUrl: 'https://meet.example.ro/nou' });
      const mail = await outbox.findOneByOrFail({ kind: 'event-updated' });
      expect(mail.text).toContain('Link nou: https://meet.example.ro/nou');
    });
  });
});
