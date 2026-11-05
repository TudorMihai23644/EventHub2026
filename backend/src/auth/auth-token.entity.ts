import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

export type AuthTokenKind = 'PASSWORD_RESET' | 'EMAIL_VERIFY';

// Linkuri de unică folosință (resetare parolă, confirmare email).
// Se păstrează doar hash-ul SHA-256 al token-ului: cine citește baza de date nu le poate folosi.
@Entity('auth_tokens')
export class AuthToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 20 })
  kind: AuthTokenKind;

  @Index({ unique: true })
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Folosit sau anulat (un link nou îl anulează pe cel vechi). */
  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
