import { DataSource, Repository } from 'typeorm';
import { clearTables, openTestDb } from '../test/int-db';
import { GeoConfig, GeoPoint, Geocoder, GeocoderError } from './geocoder';
import { GeocodingWorker, MAX_GEO_ATTEMPTS } from './geocoding.worker';
import { EventsService } from '../events/events.service';
import { Event } from '../events/event.entity';
import { Registration } from '../registrations/registration.entity';
import { Notifications } from '../mail/notifications.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { User } from '../users/user.entity';

/** Geocoder fals: răspunsuri pe adresă, numără apelurile, poate eșua sau poate fi „ținut” la mijloc. */
class FakeGeocoder extends Geocoder {
  calls: string[] = [];
  fail = false;
  hold: Promise<void> | null = null;
  places: Record<string, GeoPoint> = { 'Piața Sfatului, Brașov': { lat: 45.6427, lng: 25.5887, label: 'Piața Sfatului, Brașov, România' } };
  async search(q: string) {
    this.calls.push(q);
    if (this.hold) await this.hold;
    if (this.fail) throw new GeocoderError('indisponibil');
    return this.places[q] ?? null;
  }
}

const cfg: GeoConfig = { enabled: true, baseUrl: 'http://fake', userAgent: 'test', countryCodes: 'ro', minIntervalMs: 0 };

describe('Harta: geocodare în fundal (integrare)', () => {
  let ds: DataSource;
  let repo: Repository<Event>;
  let events: EventsService;
  let geo: FakeGeocoder;
  let worker: GeocodingWorker;
  let org: User;

  beforeAll(async () => {
    ds = await openTestDb();
    repo = ds.getRepository(Event);
    const notifications = new Notifications({ appUrl: 'http://app.test', timeZone: 'Europe/Bucharest', from: 'x@test' });
    events = new EventsService(repo, ds.getRepository(Registration), ds, notifications, new WaitlistService(ds, notifications));
  });
  afterAll(() => ds?.destroy());
  beforeEach(async () => {
    await clearTables(ds);
    geo = new FakeGeocoder();
    worker = new GeocodingWorker(ds, geo, cfg);
    org = await ds.getRepository(User).save({ name: 'Org', email: `o${Date.now()}@t.ro`, passwordHash: 'x', role: 'ORGANIZER', emailVerifiedAt: new Date() });
  });

  const owner = () => ({ id: org.id, role: 'ORGANIZER' as const, emailVerified: true });
  const create = (location: string, over: Record<string, unknown> = {}) =>
    events.create(owner(), { title: 'Concert', description: 'Descriere de test', capacity: 10, startsAt: new Date(Date.now() + 86_400_000).toISOString(), location, ...over } as never);
  const row = (id: string) => repo.findOneByOrFail({ id });

  it('salvarea nu așteaptă: PENDING, apoi worker-ul găsește punctul; publicul vede harta, nu câmpurile interne', async () => {
    const created = await create('Piața Sfatului, Brașov');
    expect(created.map).toBeNull();
    expect(created.geocode).toEqual({ status: 'PENDING', label: null });
    expect(geo.calls).toEqual([]);

    expect(await worker.processBatch()).toBe(1);
    const pub = await events.findOne(created.id);
    expect(pub.map).toMatchObject({ lat: 45.6427, lng: 25.5887 });
    expect(pub.geocode).toBeNull(); // doar organizatorul vede starea
    for (const k of ['latitude', 'longitude', 'geocodeQuery', 'geocodeStatus', 'geocodeLabel', 'geocodeAttempts', 'geocodeAfter']) expect(pub).not.toHaveProperty(k, expect.anything());
    expect((await events.findOne(created.id, owner())).geocode).toEqual({ status: 'FOUND', label: 'Piața Sfatului, Brașov, România' });
    expect(await worker.processBatch()).toBe(0);
  });

  it('adresă inexistentă → NOT_FOUND, fără hartă', async () => {
    const e = await create('Strada Inventată 999');
    await worker.processBatch();
    expect((await events.findOne(e.id, owner())).geocode?.status).toBe('NOT_FOUND');
  });

  it('cache: aceeași adresă (altă scriere) la alt eveniment nu mai întreabă Nominatim', async () => {
    await create('Piața Sfatului, Brașov');
    await worker.processBatch();
    const second = await create('  piața sfatului,   BRAȘOV ');
    await worker.processBatch();
    expect(geo.calls).toHaveLength(1);
    expect((await events.findOne(second.id)).map).toMatchObject({ lat: 45.6427 });
  });

  it('online → SKIPPED, worker-ul nu-l atinge; editare fără schimbarea locației nu caută din nou', async () => {
    const online = await create('', { format: 'ONLINE', onlineUrl: 'https://meet.example.com/x' });
    expect((await row(online.id)).geocodeStatus).toBe('SKIPPED');
    const e = await create('Piața Sfatului, Brașov');
    await worker.processBatch();
    await events.update(owner(), e.id, { title: 'Concert nou' });
    expect((await row(e.id)).geocodeStatus).toBe('FOUND');
    await events.update(owner(), e.id, { location: 'Strada Inventată 999' });
    expect(await row(e.id)).toMatchObject({ geocodeStatus: 'PENDING', latitude: null });
    expect(geo.calls).toHaveLength(1);
  });

  it('serverul cade: reîncercări cu pauze tot mai mari, apoi FAILED; o locație nouă repornește', async () => {
    const e = await create('Piața Sfatului, Brașov');
    geo.fail = true;
    for (let i = 1; i <= MAX_GEO_ATTEMPTS; i++) {
      await worker.processBatch();
      const r = await row(e.id);
      expect(r.geocodeAttempts).toBe(i);
      if (i < MAX_GEO_ATTEMPTS) {
        expect(r.geocodeStatus).toBe('PENDING');
        const waitMin = (r.geocodeAfter.getTime() - Date.now()) / 60_000;
        expect(waitMin).toBeGreaterThan(2 ** (i - 1) - 0.1);
        expect(waitMin).toBeLessThanOrEqual(2 ** (i - 1) + 0.1);
        await ds.query(`UPDATE events SET "geocodeAfter" = now() WHERE id = $1`, [e.id]); // „a trecut pauza”
      }
    }
    expect((await row(e.id)).geocodeStatus).toBe('FAILED');
    expect(await worker.processBatch()).toBe(0);
    geo.fail = false;
    await events.update(owner(), e.id, { location: 'Piața Sfatului, Brașov ' }); // aceeași cheie: nu repornește
    expect((await row(e.id)).geocodeStatus).toBe('FAILED');
    await events.update(owner(), e.id, { location: 'Piața Sfatului nr. 1, Brașov' });
    expect((await row(e.id)).geocodeStatus).toBe('PENDING');
  });

  it('locația se schimbă cât timp căutarea e în curs: rezultatul vechi nu suprascrie', async () => {
    const e = await create('Piața Sfatului, Brașov');
    let release!: () => void;
    geo.hold = new Promise((r) => { release = r; });
    const running = worker.processBatch();
    await new Promise((r) => setTimeout(r, 50)); // căutarea a pornit
    await events.update(owner(), e.id, { location: 'Strada Inventată 999' });
    release();
    await running;
    expect(await row(e.id)).toMatchObject({ geocodeStatus: 'PENDING', geocodeQuery: 'strada inventată 999', latitude: null });
  });

  it('rezultatul nu modifică updatedAt (SEQUENCE din .ics rămâne la fel)', async () => {
    const e = await create('Piața Sfatului, Brașov');
    const before = (await row(e.id)).updatedAt;
    await worker.processBatch();
    expect((await row(e.id)).updatedAt).toEqual(before);
  });

  it('GEOCODER=off: worker-ul nu face nimic', async () => {
    await create('Piața Sfatului, Brașov');
    await new GeocodingWorker(ds, geo, { ...cfg, enabled: false }).tick();
    expect(geo.calls).toEqual([]);
  });
});
