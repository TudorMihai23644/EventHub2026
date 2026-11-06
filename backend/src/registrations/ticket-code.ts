// Codul biletului: 10 caractere din alfabetul Crockford base32 (fără I, L, O, U: nu se confundă cu 1 / 0 și nu
// formează cuvinte), 50 de biți aleatori. Se citește ușor la intrare („7KQ2M-9XH4T”) și nu poate fi ghicit.
// Codul îl generează baza de date: funcția eventhub_ticket_code() (migrarea AddTickets), valoare implicită a coloanei.
export const TICKET_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const TICKET_CODE_LENGTH = 10;

/** Ce tastează sau scanează cineva → forma canonică: majuscule, fără spații/cratime, O→0, I/L→1. null dacă nu e un cod. */
export function normalizeTicketCode(input: string): string | null {
  const s = String(input ?? '').trim().toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return new RegExp(`^[${TICKET_ALPHABET}]{${TICKET_CODE_LENGTH}}$`).test(s) ? s : null;
}

/** „7KQ2M9XH4T” → „7KQ2M-9XH4T” (pentru afișare). */
export const formatTicketCode = (code: string) => `${code.slice(0, 5)}-${code.slice(5)}`;

