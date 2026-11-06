import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { GEO_CONFIG, GeoConfig, GeoPoint, Geocoder, GeocoderError } from './geocoder';

export const GEO_TICK_MS = 10_000;
export const GEO_BATCH = 10;
export const MAX_GEO_ATTEMPTS = 6; // 1 + 2 + 4 + 8 + 16 minute între încercări, apoi FAILED

interface Pending { id: string; location: string; geocodeQuery: string; geocodeAttempts: number }

/**
 * Caută pe hartă locațiile evenimentelor salvate recent. Salvarea unui eveniment nu așteaptă după Nominatim
 * (care poate fi lent sau indisponibil): evenimentul primește PENDING, iar worker-ul îl rezolvă în fundal.
 * Actualizările sunt condiționate de `geocodeQuery`: dacă organizatorul a schimbat între timp locația,
 * rezultatul vechi nu suprascrie nimic. SQL direct: `updatedAt` (din care vine SEQUENCE în .ics) nu se schimbă.
 */
@Injectable()
export class GeocodingWorker {
  private readonly logger = new Logger('GeocodingWorker');
  private running = false;

  constructor(private readonly dataSource: DataSource, private readonly geocoder: Geocoder, @Inject(GEO_CONFIG) private readonly cfg: GeoConfig) {}

  @Interval('geocoding', GEO_TICK_MS)
  async tick() {
    if (!this.cfg.enabled || this.running) return;
    this.running = true;
    try {
      await this.processBatch();
    } catch (e) {
      this.logger.error(`Ciclul de geocodare a eșuat: ${e}`);
    } finally {
      this.running = false;
    }
  }

  /** Întoarce câte evenimente a procesat. */
  async processBatch(): Promise<number> {
    const rows: Pending[] = await this.dataSource.query(
      `SELECT id, location, "geocodeQuery", "geocodeAttempts" FROM events
       WHERE "geocodeStatus" = 'PENDING' AND "geocodeQuery" IS NOT NULL AND "geocodeAfter" <= now() ORDER BY "geocodeAfter" LIMIT $1`,
      [GEO_BATCH],
    );
    for (const row of rows) await this.resolve(row);
    return rows.length;
  }

  private async resolve(row: Pending) {
    // cache: aceeași adresă căutată deja pentru alt eveniment (fără încă o cerere la Nominatim)
    const [known] = await this.dataSource.query(
      `SELECT "geocodeStatus", latitude, longitude, "geocodeLabel" FROM events
       WHERE "geocodeQuery" = $1 AND "geocodeStatus" IN ('FOUND', 'NOT_FOUND') AND id <> $2 LIMIT 1`,
      [row.geocodeQuery, row.id],
    );
    if (known) {
      return this.save(row, known.geocodeStatus === 'FOUND' ? { lat: known.latitude, lng: known.longitude, label: known.geocodeLabel } : null);
    }
    try {
      return await this.save(row, await this.geocoder.search(row.location));
    } catch (e) {
      if (!(e instanceof GeocoderError)) throw e;
      const attempts = row.geocodeAttempts + 1;
      const failed = attempts >= MAX_GEO_ATTEMPTS;
      await this.dataSource.query(
        `UPDATE events SET "geocodeAttempts" = $3, "geocodeStatus" = $4, "geocodeAfter" = now() + make_interval(mins => $5)
         WHERE id = $1 AND "geocodeQuery" = $2 AND "geocodeStatus" = 'PENDING'`,
        [row.id, row.geocodeQuery, attempts, failed ? 'FAILED' : 'PENDING', 2 ** (attempts - 1)],
      );
      this.logger.warn(`Geocodare amânată (${attempts}/${MAX_GEO_ATTEMPTS}) pentru evenimentul ${row.id}: ${e.message}`);
    }
  }

  private save(row: Pending, hit: GeoPoint | null) {
    return this.dataSource.query(
      `UPDATE events SET "geocodeStatus" = $3, latitude = $4, longitude = $5, "geocodeLabel" = $6
       WHERE id = $1 AND "geocodeQuery" = $2 AND "geocodeStatus" = 'PENDING'`,
      [row.id, row.geocodeQuery, hit ? 'FOUND' : 'NOT_FOUND', hit?.lat ?? null, hit?.lng ?? null, hit?.label ?? null],
    );
  }
}
