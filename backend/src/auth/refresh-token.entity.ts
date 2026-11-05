import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

// Un refresh token = o sesiune de pe un dispozitiv. Se păstrează doar hash-ul SHA-256.
// La fiecare folosire se înlocuiește cu unul nou din aceeași „familie” (aceeași autentificare).
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index({ unique: true })
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  /** Toate token-urile care descind din aceeași autentificare. */
  @Index()
  @Column({ type: 'uuid' })
  familyId: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Limita absolută a sesiunii (autentificare + 90 de zile), oricât de des ar fi reînnoită. */
  @Column({ type: 'timestamptz' })
  familyExpiresAt: Date;

  /** Înlocuit printr-o reînnoire (rotație). Folosit din nou după perioada de grație = furt. */
  @Column({ type: 'timestamptz', nullable: true })
  replacedAt: Date | null;

  /** Revocat: logout, logout pe toate dispozitivele, resetare de parolă sau furt detectat. */
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
