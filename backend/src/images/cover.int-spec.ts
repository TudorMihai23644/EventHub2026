import { ForbiddenException } from '@nestjs/common';
import { mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import { DataSource, Repository } from 'typeorm';
import { clearTables, openTestDb } from '../test/int-db';
import { CoverService } from './cover.service';
import { LocalImageStorage } from './image-storage';
import { Event } from '../events/event.entity';
import { EventsService } from '../events/events.service';
import { Registration } from '../registrations/registration.entity';
import { WaitlistService } from '../waitlist/waitlist.service';
import { Notifications } from '../mail/notifications.service';
import { User } from '../users/user.entity';

const cfg = { appUrl: 'http://app.test', timeZone: 'Europe/Bucharest', from: 'x@test' };
const jpeg = () => sharp({ create: { width: 1200, height: 800, channels: 3, background: '#123456' } }).jpeg().toBuffer();

describe('Imaginea de copertă (integrare, disc + PostgreSQL)', () => {
  let ds: DataSource;
  let dir: string;
  let covers: CoverService;
  let events: EventsService;
  let eventRepo: Repository<Event>;
  let org: User;
  let n = 0;

  beforeAll(async () => {
    ds = await openTestDb();
    dir = await mkdtemp(join(tmpdir(), 'eventhub-covers-'));
    covers = new CoverService(ds, new LocalImageStorage(dir));
    eventRepo = ds.getRepository(Event);
    const notifications = new Notifications(cfg);
    events = new EventsService(eventRepo, ds.getRepository(Registration), ds, notifications, new WaitlistService(ds, notifications));
  });
  afterAll(async () => {
    await ds?.destroy();
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await clearTables(ds);
    for (const f of await readdir(dir)) await rm(join(dir, f));
    org = await ds.getRepository(User).save({ name: 'Org', email: `c${++n}@test.ro`, passwordHash: 'x', role: 'ORGANIZER' } as User);
  });

  const event = () =>
    eventRepo.save(eventRepo.create({
      title: 'Cu copertă', description: 'Descriere de test', location: 'Brașov', capacity: 5,
      startsAt: new Date(Date.now() + 86_400_000), organizerId: org.id,
    }));
  const files = async () => (await readdir(dir)).sort();

  it('încărcare: două fișiere WebP pe disc, adresele pe eveniment, cheile nu ies în API', async () => {
    const e = await event();
    const cover = await covers.set(org.id, e.id, await jpeg());
    expect(cover!.large).toMatch(/^\/uploads\/[0-9a-f-]{36}-large\.webp$/);
    expect(cover!.small).toMatch(/^\/uploads\/[0-9a-f-]{36}-small\.webp$/);
    expect(await files()).toHaveLength(2);
    const view = await events.findOne(e.id);
    expect(view.cover).toEqual(cover);
    expect((view as unknown as { coverImage?: unknown }).coverImage).toBeUndefined();
  });

  it('înlocuire: fișierele vechi se șterg', async () => {
    const e = await event();
    const first = await covers.set(org.id, e.id, await jpeg());
    const second = await covers.set(org.id, e.id, await jpeg());
    expect(second).not.toEqual(first);
    expect(await files()).toEqual([second!.large, second!.small].map((u) => u.replace('/uploads/', '')).sort());
  });

  it('eliminare: coperta dispare și fișierele la fel', async () => {
    const e = await event();
    await covers.set(org.id, e.id, await jpeg());
    await covers.remove(org.id, e.id);
    expect((await events.findOne(e.id)).cover).toBeNull();
    expect(await files()).toEqual([]);
  });

  it('ștergerea evenimentului întoarce coperta, ca fișierele să fie șterse după', async () => {
    const e = await event();
    await covers.set(org.id, e.id, await jpeg());
    const removed = await events.remove(org.id, e.id);
    await covers.discard(removed);
    expect(await files()).toEqual([]);
  });

  it('alt organizator → 403 și nimic scris pe disc', async () => {
    const e = await event();
    const other = await ds.getRepository(User).save({ name: 'Alt', email: `o${++n}@test.ro`, passwordHash: 'x', role: 'ORGANIZER' } as User);
    await expect(covers.set(other.id, e.id, await jpeg())).rejects.toThrow(ForbiddenException);
    expect(await files()).toEqual([]);
  });

  it('un fișier respins (text) → 400 și nimic scris pe disc', async () => {
    const e = await event();
    await expect(covers.set(org.id, e.id, Buffer.from('nu e imagine'))).rejects.toThrow('JPEG, PNG sau WebP');
    expect(await files()).toEqual([]);
  });

  it('două încărcări simultane: rămâne exact o copertă, fără fișiere orfane', async () => {
    const e = await event();
    const [a, b] = [await jpeg(), await jpeg()];
    await Promise.all([covers.set(org.id, e.id, a), covers.set(org.id, e.id, b)]);
    const view = await events.findOne(e.id);
    expect(await files()).toEqual([view.cover!.large, view.cover!.small].map((u) => u.replace('/uploads/', '')).sort());
  });
});
