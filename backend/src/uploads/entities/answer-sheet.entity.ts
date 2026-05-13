import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { Exam } from '../../exams/entities/exam.entity';

@Entity('answer_sheets')
export class AnswerSheet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Exam)
  exam: Exam;

  @Column()
  studentName: string;

  @Column()
  registrationNo: string;

  @Column()
  filePath: string;

  @Column({ default: 'uploaded' })
  status: 'uploaded' | 'mapped' | 'processing' | 'flagged' | 'awaiting_approval' | 'approved';

  @CreateDateColumn()
  uploadedAt: Date;
}