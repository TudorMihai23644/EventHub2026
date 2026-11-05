import { OutboxEmail } from './outbox.entity';

export const MAX_ATTEMPTS = 5;

/** Așteptarea înainte de încercarea următoare: 1, 2, 4, 8 minute; cel puțin cât cere `retry-after`. */
export function retryDelaySeconds(attempts: number, retryAfterSeconds?: number): number {
  const backoff = 60 * 2 ** Math.max(0, attempts - 1);
  return Math.max(backoff, retryAfterSeconds ?? 0);
}

export const SCRUBBED = '[conținut șters după trimitere]';

/** Emailurile cu link secret nu își păstrează conținutul în baza de date după ce au plecat (sau au eșuat definitiv). */
function scrubIfSensitive(row: OutboxEmail) {
  if (!row.sensitive) return;
  row.html = SCRUBBED;
  row.text = SCRUBBED;
}

export function markSent(row: OutboxEmail, now: Date) {
  row.status = 'SENT';
  row.sentAt = now;
  row.lastError = null;
  scrubIfSensitive(row);
}

/** Trimiterea a eșuat. `permanent`: nu are rost să reîncercăm (ex. adresă invalidă). */
export function markFailed(row: OutboxEmail, error: string, now: Date, opts: { permanent?: boolean; retryAfterSeconds?: number } = {}) {
  row.attempts += 1;
  row.lastError = error.slice(0, 2000);
  if (opts.permanent || row.attempts >= MAX_ATTEMPTS) {
    row.status = 'FAILED';
    scrubIfSensitive(row);
    return;
  }
  row.sendAfter = new Date(now.getTime() + retryDelaySeconds(row.attempts, opts.retryAfterSeconds) * 1000);
}
