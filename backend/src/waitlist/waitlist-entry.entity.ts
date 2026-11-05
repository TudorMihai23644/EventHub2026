import { CreateDateColumn, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { User } from '../users/user.entity';
import { Event } from '../events/event.entity';

// Lista de așteptare a unui eveniment plin. Tabel separat de `registrations`, ca nimic din ce numără
// locurile ocupate (capacitate, participanți, rezumat, emailuri) să nu numere din greșeală oamenii care doar așteaptă.
// Ordinea: primul venit, primul servit (`createdAt`, apoi `id`).
@Entity('waitlist_entries')
@Unique(['userId', 'eventId'])
@Index(['eventId', 'createdAt'])
export class WaitlistEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  eventId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Event, (e) => e.waitlist, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
