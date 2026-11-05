import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Registration } from '../registrations/registration.entity';

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'varchar', length: 160 })
  location: string;

  @Column({ type: 'int' })
  capacity: number;

  @Column({ type: 'uuid' })
  organizerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizerId' })
  organizer: User;

  @OneToMany(() => Registration, (r) => r.event)
  registrations: Registration[];

  @CreateDateColumn()
  createdAt: Date;

  // populat de loadRelationCountAndMap, nu este coloană
  registeredCount?: number;
}
