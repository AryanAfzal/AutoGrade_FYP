import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, ManyToOne } from 'typeorm';
import { Question } from './question.entity';
import { User } from '../../users/entities/user.entity';

@Entity('exams')
export class Exam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column()
  course: string;

  @Column()
  term: string;

  @Column()
  totalMarks: number;

  @Column({ default: 'draft' })
  status: 'draft' | 'active' | 'under_review' | 'published' | 'closed';

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  recheckDeadline: Date | null;

  @ManyToOne(() => User)
  createdBy: User;

  @OneToMany(() => Question, (q) => q.exam, { cascade: true, eager: true })
  questions: Question[];

  @CreateDateColumn()
  createdAt: Date;
}