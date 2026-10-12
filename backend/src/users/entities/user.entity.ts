import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type UserRole = 'teacher' | 'admin' | 'student';
export type UserAccountStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fullName: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({
    type: 'enum',
    enum: ['teacher', 'admin', 'student'],
    default: 'teacher',
  })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'APPROVED',
  })
  status: UserAccountStatus;

  @Column({ nullable: true })
  course: string | null;

  @Column({ nullable: true })
  teacherId: string | null;

  @Column({ nullable: true })
  rejectionReason: string | null;

  @Column({ nullable: true })
  phone: string | null;

  @Column({ nullable: true })
  department: string | null;

  @Column({ nullable: true })
  qualification: string | null;

  @Column('simple-array', { nullable: true })
  assignedSubjects: string[] | null;

  @Column({ nullable: true })
  approvedByTeacherId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  requestedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}