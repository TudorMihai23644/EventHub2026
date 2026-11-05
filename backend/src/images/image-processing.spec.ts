import sharp from 'sharp';
import { ImageRejected, MAX_INPUT_PIXELS, processCover, sniffImageType } from './image-processing';

const solid = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#c8102e' } });

describe('sniffImageType: tipul din octeți, nu din nume', () => {
  it('recunoaște JPEG, PNG, WebP', async () => {
    expect(sniffImageType(await solid(10, 10).jpeg().toBuffer())).toBe('jpeg');
    expect(sniffImageType(await solid(10, 10).png().toBuffer())).toBe('png');
    expect(sniffImageType(await solid(10, 10).webp().toBuffer())).toBe('webp');
  });

  it('respinge SVG, GIF, HTML, text, gol', async () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImageType(await solid(10, 10).gif().toBuffer())).toBeNull();
    expect(sniffImageType(Buffer.from('<!doctype html><html></html>'))).toBeNull();
    expect(sniffImageType(Buffer.from('nu e imagine'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('processCover', () => {
  it('produce WebP 1600×900 și 640×360', async () => {
    const out = await processCover(await solid(3000, 2000).jpeg().toBuffer());
    for (const [buf, w, h] of [[out.large, 1600, 900], [out.small, 640, 360]] as const) {
      const m = await sharp(buf).metadata();
      expect([m.format, m.width, m.height]).toEqual(['webp', w, h]);
    }
  });

  it('elimină TOATE metadatele, inclusiv locația GPS din EXIF', async () => {
    const withGps = await solid(1200, 800)
      .jpeg()
      .withExif({
        IFD0: { Make: 'TelefonTest', Model: 'X1', Artist: 'Ana Pop' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '45/1 39/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '25/1 35/1 0/1' },
      })
      .toBuffer();
    const inMeta = await sharp(withGps).metadata();
    expect(inMeta.exif).toBeDefined(); // testul are sens doar dacă intrarea chiar are EXIF
    expect(inMeta.exif!.toString('latin1')).toContain('TelefonTest');

    const out = await processCover(withGps);
    for (const buf of [out.large, out.small]) {
      const m = await sharp(buf).metadata();
      expect(m.exif).toBeUndefined();
      expect(m.xmp).toBeUndefined();
      expect(m.icc).toBeUndefined();
      expect(buf.toString('latin1')).not.toContain('TelefonTest');
      expect(buf.toString('latin1')).not.toContain('Ana Pop');
    }
  });

  it('aplică orientarea din cameră, apoi nu mai păstrează câmpul de orientare', async () => {
    const rotated = await solid(1200, 800).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect((await sharp(rotated).metadata()).orientation).toBe(6);
    const m = await sharp((await processCover(rotated)).large).metadata();
    expect(m.orientation).toBeUndefined();
  });

  it('acceptă PNG și WebP', async () => {
    await expect(processCover(await solid(800, 600).png().toBuffer())).resolves.toBeDefined();
    await expect(processCover(await solid(800, 600).webp().toBuffer())).resolves.toBeDefined();
  });

  it.each([
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), 'JPEG, PNG sau WebP'],
    ['text cu extensia .png (numele nu contează)', Buffer.from('nu e imagine'), 'JPEG, PNG sau WebP'],
    ['JPEG trunchiat', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(50, 7)]), 'nu este o imagine validă'],
  ])('%s → respins', async (_label, input, message) => {
    await expect(processCover(input)).rejects.toThrow(ImageRejected);
    await expect(processCover(input)).rejects.toThrow(message);
  });

  it('GIF → respins', async () => {
    await expect(processCover(await solid(100, 100).gif().toBuffer())).rejects.toThrow('JPEG, PNG sau WebP');
  });

  it(`peste ${MAX_INPUT_PIXELS / 1e6} de megapixeli → respins, chiar dacă fișierul e mic`, async () => {
    const huge = await solid(8000, 6000).png({ compressionLevel: 9 }).toBuffer(); // 48 MP, o singură culoare
    expect(huge.length).toBeLessThan(5 * 1024 * 1024);
    await expect(processCover(huge)).rejects.toThrow('prea mulți pixeli');
  });
});
