import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { AnswerSheet } from '../../uploads/entities/answer-sheet.entity';
import { AnswerEntry } from './answer-entry.entity';

@Entity('student_results')
export class StudentResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AnswerSheet)
  answerSheet: AnswerSheet;

  @Column('float')
  totalAiMark: number;

  @Column()
  totalMaxMarks: number;

  @Column({ type: 'float', nullable: true })
  totalApprovedMark: number | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewCompletedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @Column({ default: 'awaiting_approval' })
  status: string;

  @Column({ default: 'clean', nullable: true })
  cheatingStatus: string; // 'clean' | 'suspected' | 'confirmed_cheating'

  @Column({ type: 'text', nullable: true })
  cheatingPenaltyNotes: string | null;

  @Column('jsonb', { nullable: true })
  cheatingReport: any | null;

  @OneToMany(() => AnswerEntry, (e) => e.result, { cascade: true, eager: true })
  entries: AnswerEntry[];
}
