import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import { GeoConfig, GeocoderError, NominatimGeocoder, geoConfig } from './geocoder';

/** Nominatim fals: răspunsul îl alege fiecare test; cererile primite sunt păstrate. */
describe('NominatimGeocoder', () => {
  let server: Server;
  let base: string;
  let reply: (req: IncomingMessage) => { status: number; body: string };
  const seen: { url: URL; headers: IncomingMessage['headers']; at: number }[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      seen.push({ url: new URL(req.url!, 'http://x'), headers: req.headers, at: Date.now() });
      const r = reply(req);
      res.writeHead(r.status, { 'Content-Type': 'application/json' }).end(r.body);
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise((ok) => server.close(ok)));
  beforeEach(() => { seen.length = 0; });

  const geocoder = (over: Partial<GeoConfig> = {}) =>
    new NominatimGeocoder({ enabled: true, baseUrl: base, userAgent: 'EventHub-test/1.0 (+http://app.test)', countryCodes: 'ro', minIntervalMs: 0, ...over }, 1000);

  it('trimite căutarea cu User-Agent propriu, o singură potrivire, doar în România', async () => {
    reply = () => ({ status: 200, body: JSON.stringify([{ lat: '45.6427', lon: '25.5887', display_name: 'Piața Sfatului, Brașov, România' }]) });
    expect(await geocoder().search('Piața Sfatului, Brașov')).toEqual({ lat: 45.6427, lng: 25.5887, label: 'Piața Sfatului, Brașov, România' });
    const { url, headers } = seen[0];
    expect(url.pathname).toBe('/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'Piața Sfatului, Brașov', format: 'jsonv2', limit: '1', countrycodes: 'ro' });
    expect(headers['user-agent']).toBe('EventHub-test/1.0 (+http://app.test)');
    expect(headers['accept-language']).toBe('ro,en');
  });

  it('fără rezultate → null (nu e eroare); coordonate invalide → null', async () => {
    reply = () => ({ status: 200, body: '[]' });
    expect(await geocoder().search('nicăieri')).toBeNull();
    reply = () => ({ status: 200, body: JSON.stringify([{ lat: '999', lon: 'x' }]) });
    expect(await geocoder().search('ciudat')).toBeNull();
  });

  it.each([
    [500, '{}'], [429, '{}'], [200, 'nu e json'], [200, '{"error":"x"}'],
  ])('HTTP %i %s → GeocoderError (se reîncearcă)', async (status, body) => {
    reply = () => ({ status, body });
    await expect(geocoder().search('x')).rejects.toThrow(GeocoderError);
  });

  it('serverul nu răspunde → GeocoderError', async () => {
    await expect(new NominatimGeocoder({ ...geoConfig({}), baseUrl: 'http://127.0.0.1:9' }, 500).search('x')).rejects.toThrow(GeocoderError);
  });

  it('cel mult o cerere pe interval, chiar și cu apeluri în paralel', async () => {
    reply = () => ({ status: 200, body: '[]' });
    const g = geocoder({ minIntervalMs: 150 });
    await Promise.all([g.search('a'), g.search('b'), g.search('c')]);
    const gaps = seen.slice(1).map((s, i) => s.at - seen[i].at);
    expect(gaps.every((ms) => ms >= 140)).toBe(true);
  });

  it('o eroare nu blochează coada', async () => {
    let n = 0;
    reply = () => (++n === 1 ? { status: 503, body: '' } : { status: 200, body: '[]' });
    const g = geocoder();
    const [a, b] = await Promise.allSettled([g.search('a'), g.search('b')]);
    expect(a.status).toBe('rejected');
    expect(b).toEqual({ status: 'fulfilled', value: null });
  });
});

describe('geoConfig', () => {
  it('implicit: Nominatim public, România, 1,1 s între cereri, User-Agent cu adresa aplicației', () => {
    expect(geoConfig({ APP_URL: 'https://eventhub.ro/' })).toEqual({
      enabled: true, baseUrl: 'https://nominatim.openstreetmap.org', userAgent: 'EventHub/1.0 (+https://eventhub.ro)', countryCodes: 'ro', minIntervalMs: 1100,
    });
  });
  it('GEOCODER=off dezactivează; țara poate fi golită; intervalul invalid revine la implicit', () => {
    expect(geoConfig({ GEOCODER: 'OFF', GEOCODER_COUNTRY: '', GEOCODER_MIN_INTERVAL_MS: 'abc' })).toMatchObject({ enabled: false, countryCodes: '', minIntervalMs: 1100 });
    expect(geoConfig({ GEOCODER_MIN_INTERVAL_MS: '0' }).minIntervalMs).toBe(0);
  });
});
