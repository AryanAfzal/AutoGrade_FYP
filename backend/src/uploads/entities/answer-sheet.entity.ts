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

  @Column({ default: 'trocr' })
  ocrEngine: 'trocr' | 'pen_to_print';

  @Column({ default: 'uploaded' })
  status: 'uploaded' | 'processing' | 'awaiting_approval' | 'approved' | 'flagged' | 'mapped';

  @CreateDateColumn()
  uploadedAt: Date;
}
