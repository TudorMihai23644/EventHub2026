import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, In } from 'typeorm';
import { Registration } from '../registrations/registration.entity';
import { WaitlistEntry } from '../waitlist/waitlist-entry.entity';
import { Notifications } from '../mail/notifications.service';

export const REMINDER_WINDOW_HOURS = 24;
export const REMINDERS_PER_RUN = 500;
/** La fiecare 15 minute. REMINDERS_CRON (ex. la fiecare 5 secunde: "*\/5 * * * * *") doar pentru teste. */
const SCHEDULE = process.env.REMINDERS_CRON?.trim() || '*/15 * * * *';

/**
 * Regula „cine primește memento”, ca funcție pură (aceeași regulă este scrisă în SQL în `run`):
 * evenimentul începe în următoarele 24 de ore și nu a început; memento-ul nu a fost trimis;
 * înscrierea s-a făcut ÎNAINTE de fereastra de 24 de ore (cine s-a înscris sau a fost promovat de pe lista
 * de așteptare cu câteva ore înainte tocmai a primit confirmarea, cu aceleași detalii).
 */
export function dueForReminder(r: { startsAt: Date; registeredAt: Date; reminderSentAt: Date | null }, now: Date): boolean {
  const start = r.startsAt.getTime();
  const windowOpens = start - REMINDER_WINDOW_HOURS * 3_600_000;
  return r.reminderSentAt === null && start > now.getTime() && now.getTime() >= windowOpens && r.registeredAt.getTime() < windowOpens;
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger('Reminders');
  private running = false;

  constructor(private readonly dataSource: DataSource, private readonly notifications: Notifications) {}

  @Cron(SCHEDULE, { name: 'event-reminders' })
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      while ((await this.run()) === REMINDERS_PER_RUN) {
        /* mai sunt: continuă imediat */
      }
    } catch (e) {
      this.logger.error(`Memento-urile nu au putut fi pregătite: ${e}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Pune în coadă memento-urile scadente și le marchează, în aceeași tranzacție.
   * SKIP LOCKED: două instanțe ale API-ului nu iau niciodată aceeași înscriere. Ora: a bazei de date.
   */
  run(): Promise<number> {
    return this.dataSource.transaction(async (m) => {
      const due: { id: string }[] = await m.query(
        `SELECT r.id
           FROM registrations r
           JOIN events e ON e.id = r."eventId"
          WHERE r."reminderSentAt" IS NULL
            AND e."startsAt" > now()
            AND e."startsAt" <= now() + make_interval(hours => $1)
            AND r."createdAt" < e."startsAt" - make_interval(hours => $1)
          ORDER BY e."startsAt", r.id
          LIMIT $2
          FOR UPDATE OF r SKIP LOCKED`,
        [REMINDER_WINDOW_HOURS, REMINDERS_PER_RUN],
      );
      if (!due.length) return 0;
      const ids = due.map((d) => d.id);
      const rows = await m.find(Registration, { where: { id: In(ids) }, relations: { user: true, event: true } });
      const eventIds = [...new Set(rows.map((r) => r.eventId))];
      const waiting = new Set(
        (await m.find(WaitlistEntry, { where: { eventId: In(eventIds) }, select: { eventId: true } })).map((w) => w.eventId),
      );
      const now: Date = (await m.query('SELECT now() AS now'))[0].now;
      for (const r of rows) {
        await this.notifications.reminder(m, { user: r.user, event: r.event, hasWaitlist: waiting.has(r.eventId), now });
      }
      await m.update(Registration, { id: In(ids) }, { reminderSentAt: () => 'now()' });
      this.logger.log(`${rows.length} memento-uri puse în coadă.`);
      return rows.length;
    });
  }
}
