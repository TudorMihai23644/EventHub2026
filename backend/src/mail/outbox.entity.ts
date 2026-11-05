import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type OutboxStatus = 'PENDING' | 'SENT' | 'FAILED';

// Coada de emailuri. Rândurile se scriu în aceeași tranzacție cu acțiunea (înscriere, modificare, ștergere),
// iar OutboxWorker le trimite. Rămân în tabel ca istoric.
@Entity('email_outbox')
@Index(['status', 'sendAfter']) // worker-ul caută „PENDING, cu sendAfter trecut”
export class OutboxEmail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 320 })
  to: string;

  @Column({ type: 'varchar', length: 300 })
  subject: string;

  @Column({ type: 'text' })
  html: string;

  @Column({ type: 'text' })
  text: string;

  /** ex. registration-confirmed, event-cancelled */
  @Column({ type: 'varchar', length: 40 })
  kind: string;

  @Column({ type: 'varchar', length: 10, default: 'PENDING' })
  status: OutboxStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  /** Conține un link secret (resetare parolă, confirmare email): HTML-ul și textul se șterg după trimitere. */
  @Column({ type: 'boolean', default: false })
  sensitive: boolean;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  sendAfter: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;
}
