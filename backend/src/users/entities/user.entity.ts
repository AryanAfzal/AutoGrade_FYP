import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fullName: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;  // bcrypt hash

  @Column({ default: 'teacher' })
  role: 'teacher' | 'admin' | 'student';

  @CreateDateColumn()
  createdAt: Date;
}