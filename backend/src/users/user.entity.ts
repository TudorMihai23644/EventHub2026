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

  @CreateDateColumn()
  createdAt: Date;
}
