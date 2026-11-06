import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type Role = 'PARTICIPANT' | 'ORGANIZER';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar', select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 20 })
  role: Role;

  /** Când a confirmat adresa de email. null = neconfirmată (nu se poate înscrie / nu poate crea evenimente). */
  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  /** Intră în JWT ca `tv`. Crește la resetarea parolei: toate sesiunile vechi devin invalide. */
  @Column({ type: 'int', default: 0 })
  tokenVersion: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/** Ce află clientul despre un utilizator (răspunsul la login, register, GET /auth/me). */
export function publicUser(u: Pick<User, 'id' | 'name' | 'email' | 'role' | 'emailVerifiedAt'>) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, emailVerified: !!u.emailVerifiedAt };
}
