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

  @Column({ default: 'awaiting_approval' })
  status: string;

  @OneToMany(() => AnswerEntry, (e) => e.result, { cascade: true, eager: true })
  entries: AnswerEntry[];
}