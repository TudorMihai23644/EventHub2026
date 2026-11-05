import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { Mailer, MailerError } from './mailer';
import { OutboxEmail } from './outbox.entity';
import { markFailed, markSent } from './outbox-retry';

export const BATCH_SIZE = 100; // maximul endpointului batch Resend
export const TICK_MS = 15_000;

// Trimite emailurile din coadă. Rulează la fiecare 15 secunde.
@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger('OutboxWorker');
  private running = false;

  constructor(private readonly dataSource: DataSource, private readonly mailer: Mailer) {}

  @Interval('email-outbox', TICK_MS)
  async tick() {
    if (this.running) return; // un singur ciclu odată, în această instanță
    this.running = true;
    try {
      while ((await this.processBatch()) === BATCH_SIZE) {
        /* coada are mai mult de un lot: continuă imediat */
      }
    } catch (e) {
      this.logger.error(`Ciclul de trimitere a eșuat: ${e}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Ia până la BATCH_SIZE emailuri scadente, le trimite într-o cerere și le marchează. Întoarce câte a procesat.
   * Ora vine implicit de la baza de date, nu de la Node: `sendAfter` este scris tot cu ceasul bazei, deci comparația
   * folosește un singur ceas (API-ul și baza pot rula în containere diferite; PostgreSQL are și microsecunde,
   * iar o oră JS de aceeași milisecundă ar fi „înainte” de un email abia scris). `now` explicit: doar pentru teste.
   */
  async processBatch(at?: Date): Promise<number> {
    return this.dataSource.transaction(async (m) => {
      const now: Date = at ?? (await m.query('SELECT now() AS now'))[0].now;
      // SKIP LOCKED: două instanțe ale API-ului nu iau niciodată același email.
      const rows = await m
        .createQueryBuilder(OutboxEmail, 'o')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('o.status = :status', { status: 'PENDING' })
        .andWhere('o.sendAfter <= :now', { now })
        .orderBy('o.createdAt', 'ASC')
        .addOrderBy('o.id', 'ASC')
        .limit(BATCH_SIZE)
        .getMany();
      if (!rows.length) return 0;

      // Aceeași listă de emailuri → aceeași cheie: dacă un răspuns se pierde și reîncercăm, Resend nu trimite de două ori.
      const key = 'outbox-' + createHash('sha256').update(rows.map((r) => r.id).join(',')).digest('hex');
      try {
        const res = await this.mailer.sendBatch(rows.map((r) => ({ to: r.to, subject: r.subject, html: r.html, text: r.text })), key);
        const failed = new Map(res.failed.map((f) => [f.index, f.error]));
        rows.forEach((r, i) => (failed.has(i) ? markFailed(r, failed.get(i)!, now, { permanent: true }) : markSent(r, now)));
        const ok = rows.length - failed.size;
        this.logger.log(`${this.mailer.name}: ${ok} trimise${failed.size ? `, ${failed.size} respinse` : ''}`);
      } catch (e) {
        const retryAfter = e instanceof MailerError ? e.retryAfterSeconds : undefined;
        rows.forEach((r) => markFailed(r, String(e instanceof Error ? e.message : e), now, { retryAfterSeconds: retryAfter }));
        this.logger.warn(`${this.mailer.name}: ${rows.length} emailuri nu au putut fi trimise, se reîncearcă: ${e}`);
      }
      await m.save(rows);
      return rows.length;
    });
  }
}
