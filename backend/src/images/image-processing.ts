import sharp from 'sharp';

// Imaginea de copertă: verificată și procesată pe server, niciodată servită așa cum a fost încărcată.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB, impus de multer cât timp fișierul încă se primește
export const MAX_INPUT_PIXELS = 40_000_000; // un fișier mic se poate decomprima într-o imagine uriașă
export const COVER_SIZES = {
  large: { width: 1600, height: 900 }, // pagina evenimentului
  small: { width: 640, height: 360 }, // lista de evenimente
} as const;
export type CoverSize = keyof typeof COVER_SIZES;

export type ImageType = 'jpeg' | 'png' | 'webp';

/**
 * Tipul se stabilește din primii octeți ai fișierului (semnătura), nu din nume sau din ce spune browserul.
 * Doar JPEG, PNG și WebP. SVG (care poate conține scripturi), GIF, HTML, PDF etc. nu au aceste semnături.
 */
export function sniffImageType(buf: Buffer): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Mesajul ajunge la utilizator (400). */
export class ImageRejected extends Error {}

/**
 * Verifică și produce cele două variante WebP, 16:9:
 *  - semnătura trebuie să fie JPEG / PNG / WebP și să corespundă cu ce decodează efectiv sharp;
 *  - cel mult 40 de megapixeli;
 *  - rotire după orientarea din cameră, apoi TOATE metadatele eliminate (EXIF poate conține locația GPS);
 *  - decupare „inteligentă” (zona cu cele mai multe detalii / fețe) la 1600×900 și 640×360.
 */
export async function processCover(input: Buffer): Promise<Record<CoverSize, Buffer>> {
  const type = sniffImageType(input);
  if (!type) throw new ImageRejected('Imaginea trebuie să fie JPEG, PNG sau WebP.');
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    // metadata() citește doar antetul, nu decodează pixelii: sigur și fără limită; limita o aplicăm noi mai jos,
    // cu un mesaj clar, iar procesarea propriu-zisă o are oricum (limitInputPixels).
    meta = await sharp(input, { limitInputPixels: false }).metadata();
  } catch {
    throw new ImageRejected('Fișierul nu este o imagine validă.');
  }
  if (meta.format !== type) throw new ImageRejected('Fișierul nu este o imagine validă.');
  if ((meta.width ?? 0) * (meta.height ?? 0) > MAX_INPUT_PIXELS) {
    throw new ImageRejected('Imaginea are prea mulți pixeli (maximum 40 de megapixeli).');
  }
  const render = (size: CoverSize) =>
    sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate() // orientarea din EXIF aplicată pe pixeli, înainte ca metadatele să dispară
      .resize(COVER_SIZES[size].width, COVER_SIZES[size].height, { fit: 'cover', position: sharp.strategy.attention })
      .webp({ quality: 80 }) // fără withMetadata(): ieșirea nu păstrează EXIF / XMP / ICC
      .toBuffer();
  try {
    const [large, small] = await Promise.all([render('large'), render('small')]);
    return { large, small };
  } catch {
    throw new ImageRejected('Imaginea nu a putut fi procesată. Încearcă alt fișier.');
  }
}
