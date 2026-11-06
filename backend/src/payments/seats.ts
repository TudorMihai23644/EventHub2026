import { EntityManager } from 'typeorm';

/**
 * Funcții fără dependențe (doar tranzacția apelantului), folosite de înscrieri, evenimente și plăți.
 * Toate se apelează cu lock-ul pe rândul evenimentului deja luat.
 */

/** Locuri ținute de plăți în curs (încă valabile, după ceasul bazei). */
export async function activeHolds(m: EntityManager, eventId: string): Promise<number> {
  const [{ n }] = await m.query(
    `SELECT count(*)::int AS n FROM payments WHERE "eventId" = $1 AND status = 'PENDING' AND "expiresAt" > now()`,
    [eventId],
  );
  return n;
}

/** Înscriere plătită anulată: banii se returnează (de RefundWorker, în fundal). Întoarce câte plăți se returnează. */
export async function refundOnCancel(m: EntityManager, userId: string, eventId: string): Promise<number> {
  const [, affected] = await m.query(
    `UPDATE payments SET status = 'REFUND_PENDING', "refundAfter" = now(), "updatedAt" = now()
     WHERE "userId" = $1 AND "eventId" = $2 AND status = 'PAID'`,
    [userId, eventId],
  );
  return affected ?? 0;
}

/** Eveniment șters: cei care au plătit primesc banii înapoi; plățile neterminate se anulează. */
export async function refundOnEventDeleted(m: EntityManager, eventId: string) {
  await m.query(`UPDATE payments SET status = 'REFUND_PENDING', "refundAfter" = now(), "updatedAt" = now() WHERE "eventId" = $1 AND status = 'PAID'`, [eventId]);
  await m.query(`UPDATE payments SET status = 'CANCELLED', "updatedAt" = now() WHERE "eventId" = $1 AND status = 'PENDING'`, [eventId]);
}
