import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Registration } from '../registrations/registration.entity';
import { WaitlistEntry } from '../waitlist/waitlist-entry.entity';

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Index() // lista de evenimente viitoare filtrează și sortează după dată
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

  @OneToMany(() => WaitlistEntry, (w) => w.event)
  waitlist: WaitlistEntry[];

  @CreateDateColumn()
  createdAt: Date;

  /** Ultima modificare; din ea se calculează SEQUENCE în fișierul .ics (calendarele înlocuiesc intrarea veche). */
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // populate de loadRelationCountAndMap, nu sunt coloane
  registeredCount?: number;
  waitlistCount?: number;
}
