import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { User } from '../users/user.entity';
import { Event } from '../events/event.entity';

@Entity('registrations')
@Unique(['userId', 'eventId']) // ultima linie de apărare împotriva duplicatelor
export class Registration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  eventId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Event, (e) => e.registrations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @CreateDateColumn()
  createdAt: Date;
}
