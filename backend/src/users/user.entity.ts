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

  /** null = cont creat cu Google, fără parolă (își poate seta una cu „Ai uitat parola?”). */
  @Column({ type: 'varchar', select: false, nullable: true })
  passwordHash: string | null;

  /** Identificatorul contului Google (`sub` din ID token), dacă utilizatorul s-a conectat cu Google. */
  @Column({ type: 'varchar', length: 255, unique: true, nullable: true, select: false })
  googleId: string | null;

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
