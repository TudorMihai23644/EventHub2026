import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { User } from '../users/user.entity';
import { Event } from '../events/event.entity';

@Entity('registrations')
@Unique(['userId', 'eventId']) // ultima linie de apărare împotriva duplicatelor
export class Registration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Index() // numărarea înscrierilor pe eveniment (UNIQUE(userId, eventId) începe cu userId, deci nu ajută)
  @Column({ type: 'uuid' })
  eventId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Event, (e) => e.registrations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /**
   * Codul biletului (QR la intrare). Îl generează baza de date (funcția eventhub_ticket_code(), cu gen_random_bytes
   * din pgcrypto), deci orice inserare are cod, inclusiv promovarea de pe lista de așteptare. Vezi ticket-code.ts.
   */
  @Index({ unique: true })
  @Column({ type: 'char', length: 10, default: () => 'eventhub_ticket_code()' })
  ticketCode: string;

  /** Când a fost validat biletul la intrare. null = încă nu a venit (după eveniment: absent). */
  @Column({ type: 'timestamptz', nullable: true })
  checkedInAt: Date | null;

  /** Când s-a trimis memento-ul de cu o zi înainte. Se golește dacă evenimentul își schimbă data. */
  @Column({ type: 'timestamptz', nullable: true })
  reminderSentAt: Date | null;
}
