import { Logger } from '@nestjs/common';

export const GEO_CONFIG = Symbol('GEO_CONFIG');

export interface GeoConfig {
  /** false (GEOCODER=off): nu se trimite nicio cerere, evenimentele nu au hartă. */
  enabled: boolean;
  /** Serverul Nominatim (implicit cel public OpenStreetMap; în teste, unul fals local). */
  baseUrl: string;
  /** Politica Nominatim cere un User-Agent care identifică aplicația (ideal cu un contact). */
  userAgent: string;
  /** Rezultatele se caută doar în aceste țări (coduri ISO, separate prin virgulă); gol = oriunde. */
  countryCodes: string;
  /** Pauza minimă între două cereri. Politica serverului public: cel mult 1 cerere pe secundă. */
  minIntervalMs: number;
}

export function geoConfig(env: NodeJS.ProcessEnv = process.env): GeoConfig {
  const appUrl = (env.APP_URL?.trim() || 'http://localhost:5173').replace(/\/+$/, '');
  return {
    enabled: (env.GEOCODER?.trim().toLowerCase() || 'nominatim') !== 'off',
    baseUrl: (env.NOMINATIM_URL?.trim() || 'https://nominatim.openstreetmap.org').replace(/\/+$/, ''),
    userAgent: env.GEOCODER_USER_AGENT?.trim() || `EventHub/1.0 (+${appUrl})`,
    countryCodes: env.GEOCODER_COUNTRY?.trim() ?? 'ro',
    minIntervalMs: intervalMs(env.GEOCODER_MIN_INTERVAL_MS),
  };
}

/** Doar pentru teste (server fals local) are sens o valoare sub 1000. */
function intervalMs(raw?: string) {
  const v = Number(raw);
  return raw?.trim() && Number.isFinite(v) && v >= 0 ? v : 1100;
}

export interface GeoPoint { lat: number; lng: number; label: string }

/** Eroare trecătoare (rețea, 5xx, 429): se reîncearcă mai târziu. „Nu există adresa” nu e eroare, ci `null`. */
export class GeocoderError extends Error {}

export abstract class Geocoder {
  abstract search(query: string): Promise<GeoPoint | null>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nominatim (OpenStreetMap). Doar căutări la salvarea unui eveniment, niciodată la fiecare tastă (interzis de politică). */
export class NominatimGeocoder extends Geocoder {
  private readonly logger = new Logger('Geocoder');
  private nextAt = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly cfg: GeoConfig, private readonly timeoutMs = 8000) {
    super();
  }

  /** Cererile trec pe rând (și din apeluri paralele), cu pauza minimă între ele. */
  search(query: string): Promise<GeoPoint | null> {
    const run = this.queue.then(() => this.request(query));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async request(query: string): Promise<GeoPoint | null> {
    const wait = this.nextAt - Date.now();
    if (wait > 0) await sleep(wait);
    this.nextAt = Date.now() + this.cfg.minIntervalMs;

    const url = new URL(`${this.cfg.baseUrl}/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    if (this.cfg.countryCodes) url.searchParams.set('countrycodes', this.cfg.countryCodes);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': this.cfg.userAgent, 'Accept-Language': 'ro,en', Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new GeocoderError(`Nominatim nu răspunde: ${e instanceof Error ? e.message : e}`);
    }
    if (!res.ok) throw new GeocoderError(`Nominatim a răspuns ${res.status}`);
    const data = (await res.json().catch(() => null)) as { lat?: string; lon?: string; display_name?: string }[] | null;
    if (!Array.isArray(data)) throw new GeocoderError('Răspuns Nominatim neașteptat');
    const hit = data[0];
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      this.logger.warn(`Coordonate invalide de la Nominatim pentru „${query}”`);
      return null;
    }
    return { lat, lng, label: String(hit.display_name ?? query).slice(0, 300) };
  }
}
