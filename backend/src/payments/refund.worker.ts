import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { Payment } from './payment.entity';
import { StripeClient, StripeError } from './stripe';
import { Notifications } from '../mail/notifications.service';

export const REFUND_TICK_MS = 30_000;
export const MAX_REFUND_ATTEMPTS = 8; // 1, 2, 4 … 64 minute între încercări

/**
 * Returnează banii plăților marcate REFUND_PENDING (anulare, eveniment șters, plată prea târzie), la fel ca coada de
 * emailuri: în fundal, cu reîncercări, cu cheie de idempotență (`refund-<id>`): o cerere repetată nu returnează de două ori.
 * Anularea unei înscrieri nu așteaptă după Stripe și nu eșuează dacă Stripe e indisponibil.
 */
@Injectable()
export class RefundWorker {
  private readonly logger = new Logger('RefundWorker');
  private running = false;

  constructor(private readonly dataSource: DataSource, private readonly stripe: StripeClient, private readonly notifications: Notifications) {}

  @Interval('refunds', REFUND_TICK_MS)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.processBatch();
    } catch (e) {
      this.logger.error(`Ciclul de returnări a eșuat: ${e}`);
    } finally {
      this.running = false;
    }
  }

  async processBatch(): Promise<number> {
    return this.dataSource.transaction(async (m) => {
      const rows = await m
        .createQueryBuilder(Payment, 'p')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked') // două instanțe ale API-ului nu returnează aceeași plată
        .where(`p.status = 'REFUND_PENDING' AND p.refundAfter <= now()`)
        .orderBy('p.refundAfter', 'ASC')
        .limit(20)
        .getMany();
      for (const p of rows) {
        if (!p.paymentIntentId) {
          p.status = 'REFUND_FAILED';
          p.lastError = 'lipsește plata Stripe (payment_intent)';
          await m.save(p);
          continue;
        }
        try {
          await this.stripe.refund(p.paymentIntentId, p.id);
          await this.refunded(m, p);
        } catch (e) {
          if (e instanceof StripeError && e.code === 'charge_already_refunded') {
            await this.refunded(m, p); // returnată deja (ex. din panoul Stripe)
            continue;
          }
          const transient = !(e instanceof StripeError) || e.transient;
          p.refundAttempts += 1;
          p.lastError = String(e instanceof Error ? e.message : e).slice(0, 500);
          if (!transient || p.refundAttempts >= MAX_REFUND_ATTEMPTS) {
            p.status = 'REFUND_FAILED';
            this.logger.error(`Returnarea plății ${p.id} a eșuat definitiv (verifică în panoul Stripe): ${p.lastError}`);
          } else {
            // pauza după ceasul bazei, ca restul comparațiilor (`refundAfter <= now()`)
            p.refundAfter = (await m.query(`SELECT now() + make_interval(mins => $1) AS t`, [2 ** (p.refundAttempts - 1)]))[0].t;
          }
          await m.save(p);
        }
      }
      return rows.length;
    });
  }

  private async refunded(m: EntityManager, p: Payment) {
    p.status = 'REFUNDED';
    p.lastError = null;
    await m.save(p);
    await this.notifications.paymentRefunded(m, { email: p.email, eventTitle: p.eventTitle, amountCents: p.amountCents });
  }
}
