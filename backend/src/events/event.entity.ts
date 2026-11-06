import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Registration } from '../registrations/registration.entity';
import { WaitlistEntry } from '../waitlist/waitlist-entry.entity';
import { Payment } from '../payments/payment.entity';
import type { EventCategory, EventFormat } from './categories';
import type { CoverImage } from '../images/cover.service';
import type { GeocodeStatus } from '../geo/geocode-state';

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

  /** Ora de sfârșit (opțională). „Trecut” rămâne „a început”; între început și sfârșit: „În desfășurare”. */
  @Column({ type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'ALTELE' })
  category: EventCategory;

  @Column({ type: 'varchar', length: 10, default: 'PHYSICAL' })
  format: EventFormat;

  /** Linkul pentru online/hibrid. Văzut doar de participanții înscriși și de organizator (vezi event-view.ts). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  onlineUrl: string | null;

  /** Imaginea de copertă: cheile și adresele celor două variante WebP (vezi images/cover.service.ts). */
  @Column({ type: 'jsonb', nullable: true })
  coverImage: CoverImage | null;

  // ---- harta (vezi geo/): completate în fundal de GeocodingWorker ----
  @Column({ type: 'varchar', length: 10, default: 'PENDING' })
  geocodeStatus: GeocodeStatus;

  /** Locația normalizată pentru care s-a căutat (cheia de cache); null pentru online. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  geocodeQuery: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  /** Adresa găsită de OpenStreetMap (organizatorul verifică astfel că punctul e cel bun). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  geocodeLabel: string | null;

  @Column({ type: 'int', default: 0 })
  geocodeAttempts: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  geocodeAfter: Date;

  @Column({ type: 'int' })
  capacity: number;

  /** Prețul unui loc, în bani (4990 = 49,90 lei). null = gratuit. Vezi payments/. */
  @Column({ type: 'int', nullable: true })
  priceCents: number | null;

  @Column({ type: 'uuid' })
  organizerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizerId' })
  organizer: User;

  @OneToMany(() => Registration, (r) => r.event)
  registrations: Registration[];

  @OneToMany(() => WaitlistEntry, (w) => w.event)
  waitlist: WaitlistEntry[];

  @OneToMany(() => Payment, (p) => p.event)
  payments: Payment[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /** Ultima modificare; din ea se calculează SEQUENCE în fișierul .ics (calendarele înlocuiesc intrarea veche). */
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // populate de loadRelationCountAndMap, nu sunt coloane
  registeredCount?: number;
  waitlistCount?: number;
  /** Locuri ținute de plăți în curs. */
  heldCount?: number;
}
