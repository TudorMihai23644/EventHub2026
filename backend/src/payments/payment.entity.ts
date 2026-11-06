import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Event } from '../events/event.entity';

/**
 *  - PENDING: locul e rezervat cât timp participantul plătește (până la `expiresAt`);
 *  - PAID: plătit, înscrierea există;
 *  - EXPIRED: n-a plătit la timp (locul s-a eliberat); CANCELLED: evenimentul a fost șters înainte de plată;
 *  - REFUND_PENDING → REFUNDED / REFUND_FAILED: banii se returnează (anulare, eveniment șters, plată venită prea târziu).
 */
export type PaymentStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'REFUND_PENDING' | 'REFUNDED' | 'REFUND_FAILED';

/**
 * O plată pentru un loc la un eveniment. Rândul rămâne și după ștergerea evenimentului sau a contului (SET NULL):
 * este evidența banilor și de el depinde returnarea lor.
 */
@Entity('payments')
@Index(['eventId', 'status'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'uuid', nullable: true })
  eventId: string | null;

  @ManyToOne(() => Event, (e) => e.payments, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'eventId' })
  event: Event | null;

  /** Titlul la momentul plății (evenimentul poate fi șters). */
  @Column({ type: 'varchar', length: 120 })
  eventTitle: string;

  /** Adresa la momentul plății: emailul de returnare ajunge și după ștergerea contului. */
  @Column({ type: 'varchar' })
  email: string;

  @Column({ type: 'int' })
  amountCents: number;

  @Column({ type: 'char', length: 3, default: 'RON' })
  currency: string;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status: PaymentStatus;

  /** Până când e ținut locul (expirarea sesiunii Stripe + câteva minute pentru webhook-uri întârziate). */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Index({ unique: true, where: '"stripeSessionId" IS NOT NULL' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeSessionId: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  checkoutUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  paymentIntentId: string | null;

  @Column({ type: 'int', default: 0 })
  refundAttempts: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  refundAfter: Date;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lastError: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
