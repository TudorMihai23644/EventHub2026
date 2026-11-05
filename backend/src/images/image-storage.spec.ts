import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { CloudinaryImageStorage, LocalImageStorage, cloudinarySignature, parseCloudinaryUrl } from './image-storage';

const UUID = '0b6e7a52-1111-4222-8333-944455556666';

describe('LocalImageStorage', () => {
  let dir: string;
  let storage: LocalImageStorage;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'eventhub-uploads-'));
    storage = new LocalImageStorage(dir);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('salvează sub numele generat și întoarce adresa relativă', async () => {
    const s = await storage.save(Buffer.from('webp'), `${UUID}-large`);
    expect(s).toEqual({ key: `${UUID}-large.webp`, url: `/uploads/${UUID}-large.webp` });
    expect(await readFile(join(dir, s.key), 'utf8')).toBe('webp');
  });

  it('nu suprascrie un fișier existent', async () => {
    await storage.save(Buffer.from('a'), `${UUID}-small`);
    await expect(storage.save(Buffer.from('b'), `${UUID}-small`)).rejects.toThrow();
    expect(await readFile(join(dir, `${UUID}-small.webp`), 'utf8')).toBe('a');
  });

  it.each(['../secret', 'x/../../etc/passwd', 'imagine', `${UUID}-huge`, `${UUID}-large.webp`])('nume nepermis %j → refuzat', async (name) => {
    await expect(storage.save(Buffer.from('x'), name)).rejects.toThrow('nepermis');
  });

  it('ștergerea: doar chei scrise de noi; un fișier deja șters nu e eroare', async () => {
    const s = await storage.save(Buffer.from('x'), `${UUID}-large`);
    await storage.remove(s.key);
    expect(await readdir(dir)).toEqual([]);
    await expect(storage.remove(s.key)).resolves.toBeUndefined();
    for (const bad of ['../../etc/passwd', '..\\..\\windows\\win.ini', `${UUID}-large.webp/../x`, 'C:\\x.webp']) {
      await expect(storage.remove(bad)).rejects.toThrow('nepermisă');
    }
  });
});

describe('Cloudinary', () => {
  it('parseCloudinaryUrl', () => {
    expect(parseCloudinaryUrl('cloudinary://123:abc@demo')).toMatchObject({ apiKey: '123', apiSecret: 'abc', cloudName: 'demo' });
    expect(parseCloudinaryUrl('')).toBeNull();
    expect(parseCloudinaryUrl(undefined)).toBeNull();
    expect(() => parseCloudinaryUrl('https://demo')).toThrow('cloudinary://');
  });

  it('semnătura: parametri sortați alfabetic, uniți cu &, plus secretul, SHA-1', () => {
    const sig = cloudinarySignature({ timestamp: '1315060510', public_id: 'sample' }, 'abcd');
    const expected = require('crypto').createHash('sha1').update('public_id=sample&timestamp=1315060510abcd').digest('hex');
    expect(sig).toBe(expected);
  });

  describe('pe un server Cloudinary fals', () => {
    let server: Server;
    let base: string;
    const calls: { url?: string; body: string }[] = [];
    beforeAll(async () => {
      server = createServer((req: IncomingMessage, res) => {
        let raw = '';
        req.setEncoding('latin1');
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
          calls.push({ url: req.url, body: raw });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          const publicId = /name="public_id"\r\n\r\n([^\r]+)/.exec(raw)?.[1];
          res.end(JSON.stringify(req.url!.endsWith('/upload')
            ? { public_id: publicId, secure_url: `https://res.cloudinary.com/demo/image/upload/${publicId}.webp` }
            : { result: 'ok' }));
        });
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    it('încărcare: cerere semnată cu fișierul WebP; întoarce adresa https de pe CDN', async () => {
      const storage = new CloudinaryImageStorage({ ...parseCloudinaryUrl('cloudinary://123:secret@demo')!, apiBase: base });
      const s = await storage.save(Buffer.from('WEBPDATA'), `${UUID}-large`);
      expect(s).toEqual({ key: `eventhub/${UUID}-large`, url: `https://res.cloudinary.com/demo/image/upload/eventhub/${UUID}-large.webp` });
      const call = calls.at(-1)!;
      expect(call.url).toBe('/v1_1/demo/image/upload');
      expect(call.body).toContain('WEBPDATA');
      expect(call.body).toContain('name="api_key"\r\n\r\n123');
      const ts = /name="timestamp"\r\n\r\n(\d+)/.exec(call.body)![1];
      const sig = /name="signature"\r\n\r\n([0-9a-f]+)/.exec(call.body)![1];
      expect(sig).toBe(cloudinarySignature({ public_id: `eventhub/${UUID}-large`, timestamp: ts }, 'secret'));
      expect(call.body).not.toContain('secret'); // secretul nu pleacă niciodată, doar semnătura
    });

    it('ștergere: cerere semnată la /image/destroy', async () => {
      const storage = new CloudinaryImageStorage({ ...parseCloudinaryUrl('cloudinary://123:secret@demo')!, apiBase: base });
      await storage.remove(`eventhub/${UUID}-large`);
      expect(calls.at(-1)!.url).toBe('/v1_1/demo/image/destroy');
      expect(calls.at(-1)!.body).toContain(`eventhub/${UUID}-large`);
    });
  });
});
