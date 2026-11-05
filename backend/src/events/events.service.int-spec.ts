import { DataSource, Repository } from 'typeorm';
import { EventsService } from './events.service';
import { Event } from './event.entity';
import { ListEventsQuery } from './dto/event.dto';
import { Registration } from '../registrations/registration.entity';
import { Role, User } from '../users/user.entity';
import { clearTables, openTestDb } from '../test/int-db';
import { Notifications } from '../mail/notifications.service';
import { WaitlistService } from '../waitlist/waitlist.service';

const HOUR = 3_600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);
const query = (q: Partial<ListEventsQuery> = {}) => ({ page: 1, limit: 20, ...q }) as ListEventsQuery;

describe('EventsService pe PostgreSQL (integrare)', () => {
  let ds: DataSource;
  let users: Repository<User>;
  let events: Repository<Event>;
  let regs: Repository<Registration>;
  let service: EventsService;
  let n = 0;

  beforeAll(async () => {
    ds = await openTestDb();
    users = ds.getRepository(User);
    events = ds.getRepository(Event);
    regs = ds.getRepository(Registration);
    const notifications = new Notifications({ appUrl: 'http://app.test', timeZone: 'Europe/Bucharest', from: 'x@test' });
    service = new EventsService(events, regs, ds, notifications, new WaitlistService(ds, notifications));
  });
  afterAll(() => ds?.destroy());
  beforeEach(() => clearTables(ds));

  const user = (role: Role) => {
    n++;
    return users.save(users.create({ name: `Utilizator ${n}`, email: `u${n}@test.ro`, passwordHash: 'x', role }));
  };
  const event = (organizer: User, over: Partial<Event> = {}) =>
    events.save(
      events.create({
        title: 'Eveniment', description: 'Descriere de test', location: 'Brașov',
        capacity: 10, startsAt: inHours(24), organizerId: organizer.id, ...over,
      }),
    );
  const register = (u: User, e: Event) => regs.save(regs.create({ userId: u.id, eventId: e.id }));

  describe('findUpcoming: paginare', () => {
    it('împarte 45 de evenimente în pagini de 20, fără duplicate și fără lipsuri', async () => {
      const org = await user('ORGANIZER');
      for (let i = 0; i < 45; i++) {
        // 15 evenimente la exact aceeași oră: ordinea trebuie să rămână stabilă între pagini
        await event(org, { title: `E${i}`, startsAt: i < 15 ? inHours(48) : inHours(1 + i) });
      }
      const pages = [];
      for (const page of [1, 2, 3]) pages.push(await service.findUpcoming(query({ page })));

      expect(pages.map((p) => p.items.length)).toEqual([20, 20, 5]);
      expect(pages[0]).toMatchObject({ total: 45, page: 1, limit: 20, totalPages: 3 });
      const ids = pages.flatMap((p) => p.items.map((e) => e.id));
      expect(new Set(ids).size).toBe(45);

      const times = pages.flatMap((p) => p.items.map((e) => new Date(e.startsAt).getTime()));
      expect(times).toEqual([...times].sort((a, b) => a - b));
    });

    it('o pagină după ultima este goală, dar păstrează totalul', async () => {
      const org = await user('ORGANIZER');
      await event(org);
      const res = await service.findUpcoming(query({ page: 5 }));
      expect(res).toMatchObject({ items: [], total: 1, totalPages: 1 });
    });

    it('sortarea descrescătoare pune primele evenimentele cele mai îndepărtate', async () => {
      const org = await user('ORGANIZER');
      await event(org, { title: 'Aproape', startsAt: inHours(2) });
      await event(org, { title: 'Departe', startsAt: inHours(200) });
      const res = await service.findUpcoming(query({ sort: 'desc' }));
      expect(res.items.map((e) => e.title)).toEqual(['Departe', 'Aproape']);
    });

    it('nu include evenimentele trecute', async () => {
      const org = await user('ORGANIZER');
      await event(org, { title: 'Trecut', startsAt: inHours(-2) });
      await event(org, { title: 'Viitor' });
      const res = await service.findUpcoming(query());
      expect(res.total).toBe(1);
      expect(res.items.map((e) => e.title)).toEqual(['Viitor']);
    });
  });

  describe('findUpcoming: filtrul „doar cu locuri libere” în SQL', () => {
    it('exclude evenimentele pline și le exclude și din total', async () => {
      const org = await user('ORGANIZER');
      const p = await user('PARTICIPANT');
      const all = [];
      for (let i = 0; i < 5; i++) all.push(await event(org, { title: `Loc ${i}`, capacity: 1, startsAt: inHours(1 + i) }));
      for (const e of all.slice(0, 3)) await register(p, e); // primele 3 sunt pline

      const res = await service.findUpcoming(query({ available: 'true', limit: 1 }));
      expect(res).toMatchObject({ total: 2, totalPages: 2 });
      expect(res.items[0].title).toBe('Loc 3');
      expect(res.items[0].availableSeats).toBe(1);

      const unfiltered = await service.findUpcoming(query());
      expect(unfiltered.total).toBe(5);
    });
  });

  describe('findUpcoming: căutare', () => {
    beforeEach(async () => {
      const org = await user('ORGANIZER');
      for (const title of ['100% Jazz', '1000 Jazz Night', 'a_b', 'axb']) await event(org, { title });
      await event(org, { title: 'Concert', location: 'Sala 100%' });
    });
    const titles = async (search: string) =>
      (await service.findUpcoming(query({ search }))).items.map((e) => e.title).sort();

    it('caută „%” literal, nu ca wildcard', async () => {
      expect(await titles('100%')).toEqual(['100% Jazz', 'Concert']); // „Concert” prin locație
    });

    it('caută „_” literal', async () => {
      expect(await titles('a_b')).toEqual(['a_b']);
    });

    it('nu se strică la backslash și nu găsește nimic fals', async () => {
      expect(await titles('C:\\')).toEqual([]);
    });

    it('găsește fără să țină cont de litere mari/mici', async () => {
      expect(await titles('jazz')).toEqual(['100% Jazz', '1000 Jazz Night']);
    });
  });

  describe('findUpcoming: starea utilizatorului', () => {
    it('marchează doar evenimentele la care participantul este înscris', async () => {
      const org = await user('ORGANIZER');
      const p = await user('PARTICIPANT');
      const a = await event(org, { title: 'A', startsAt: inHours(1) });
      await event(org, { title: 'B', startsAt: inHours(2) });
      await register(p, a);

      const res = await service.findUpcoming(query(), { id: p.id, role: 'PARTICIPANT' });
      expect(res.items.map((e) => [e.title, e.isRegistered, e.registeredCount])).toEqual([
        ['A', true, 1],
        ['B', false, 0],
      ]);
    });
  });

  describe('summary: o singură interogare agregată', () => {
    it('numără evenimentele, pe cele viitoare și înscrierile doar ale organizatorului', async () => {
      const org = await user('ORGANIZER');
      const other = await user('ORGANIZER');
      const [p1, p2] = [await user('PARTICIPANT'), await user('PARTICIPANT')];
      const past = await event(org, { startsAt: inHours(-48) });
      await event(org, { startsAt: inHours(-24) });
      const future = await event(org, { startsAt: inHours(24) });
      await event(org, { startsAt: inHours(48) });
      await event(org, { startsAt: inHours(72) });
      await register(p1, past);
      await register(p2, past);
      await register(p1, future);
      await register(p2, future);
      await register(p1, await event(other)); // alt organizator: nu se numără

      expect(await service.summary(org.id)).toEqual({ eventsCount: 5, upcomingCount: 3, totalRegistrations: 4, totalWaiting: 0 });
    });

    it('întoarce zero pentru un organizator fără evenimente', async () => {
      const org = await user('ORGANIZER');
      expect(await service.summary(org.id)).toEqual({ eventsCount: 0, upcomingCount: 0, totalRegistrations: 0, totalWaiting: 0 });
    });
  });
});
