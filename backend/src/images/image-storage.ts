import { createHash } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

/** Ce se salvează în `events.coverImage` pentru fiecare variantă. `url`: relativ (local) sau absolut https (Cloudinary). */
export interface StoredImage {
  key: string;
  url: string;
}

// Aceeași idee ca la emailuri (LogMailer / ResendMailer): o interfață, două implementări alese din configurare.
export abstract class ImageStorage {
  abstract readonly name: 'local' | 'cloudinary';
  /** `baseName`: generat de server (uuid + mărime), niciodată din numele fișierului încărcat. */
  abstract save(webp: Buffer, baseName: string): Promise<StoredImage>;
  abstract remove(key: string): Promise<void>;
}

// numele fișierelor pe care le scriem noi: <uuid>-<small|large>.webp
const SAFE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(small|large)$/;

/** Fișiere într-un director (volum Docker), servite de API la /api/uploads/. */
export class LocalImageStorage extends ImageStorage {
  readonly name = 'local';
  readonly dir: string;

  constructor(dir: string) {
    super();
    this.dir = resolve(dir);
  }

  async save(webp: Buffer, baseName: string): Promise<StoredImage> {
    if (!SAFE_NAME.test(baseName)) throw new Error(`Nume de fișier nepermis: ${baseName}`);
    await mkdir(this.dir, { recursive: true });
    const file = `${baseName}.webp`;
    await writeFile(join(this.dir, file), webp, { flag: 'wx' }); // nu suprascrie nimic existent
    return { key: file, url: `/uploads/${file}` };
  }

  async remove(key: string): Promise<void> {
    // doar nume scrise de noi: fără „..”, „/”, căi absolute
    if (!SAFE_NAME.test(key.replace(/\.webp$/, '')) || !key.endsWith('.webp')) throw new Error(`Cheie nepermisă: ${key}`);
    await unlink(join(this.dir, key)).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e; // deja șters: nimic de făcut
    });
  }
}

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Doar pentru teste: un server Cloudinary fals, local. */
  apiBase: string;
}

/** CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name> (formatul din consola Cloudinary). */
export function parseCloudinaryUrl(value: string | undefined, apiBase = 'https://api.cloudinary.com'): CloudinaryConfig | null {
  if (!value?.trim()) return null;
  const m = value.trim().match(/^cloudinary:\/\/([^:]+):([^@]+)@([^/?#]+)$/);
  if (!m) throw new Error('CLOUDINARY_URL trebuie să aibă forma cloudinary://<api_key>:<api_secret>@<cloud_name>.');
  return { apiKey: decodeURIComponent(m[1]), apiSecret: decodeURIComponent(m[2]), cloudName: m[3], apiBase: apiBase.replace(/\/+$/, '') };
}

/** Semnătura cererilor Cloudinary: SHA-1 peste parametrii sortați + secretul. */
export function cloudinarySignature(params: Record<string, string>, secret: string): string {
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return createHash('sha1').update(toSign + secret).digest('hex');
}

/** Imaginile deja procesate se urcă pe Cloudinary și se servesc de pe CDN-ul lui. Fără SDK: două cereri semnate. */
export class CloudinaryImageStorage extends ImageStorage {
  readonly name = 'cloudinary';

  constructor(private readonly cfg: CloudinaryConfig) {
    super();
  }

  async save(webp: Buffer, baseName: string): Promise<StoredImage> {
    if (!SAFE_NAME.test(baseName)) throw new Error(`Nume de fișier nepermis: ${baseName}`);
    const params = { public_id: `eventhub/${baseName}`, timestamp: String(Math.floor(Date.now() / 1000)) };
    const body = new FormData();
    body.set('file', new Blob([new Uint8Array(webp)], { type: 'image/webp' }), `${baseName}.webp`);
    for (const [k, v] of Object.entries(params)) body.set(k, v);
    body.set('api_key', this.cfg.apiKey);
    body.set('signature', cloudinarySignature(params, this.cfg.apiSecret));
    const res = await fetch(`${this.cfg.apiBase}/v1_1/${this.cfg.cloudName}/image/upload`, { method: 'POST', body });
    const data = (await res.json().catch(() => ({}))) as { secure_url?: string; public_id?: string; error?: { message?: string } };
    if (!res.ok || !data.secure_url || !data.public_id) {
      throw new Error(`Cloudinary: încărcarea a eșuat (${res.status}) ${data.error?.message ?? ''}`.trim());
    }
    return { key: data.public_id, url: data.secure_url };
  }

  async remove(key: string): Promise<void> {
    const params = { public_id: key, timestamp: String(Math.floor(Date.now() / 1000)) };
    const body = new FormData();
    for (const [k, v] of Object.entries(params)) body.set(k, v);
    body.set('api_key', this.cfg.apiKey);
    body.set('signature', cloudinarySignature(params, this.cfg.apiSecret));
    const res = await fetch(`${this.cfg.apiBase}/v1_1/${this.cfg.cloudName}/image/destroy`, { method: 'POST', body });
    if (!res.ok) throw new Error(`Cloudinary: ștergerea a eșuat (${res.status}).`);
  }
}
