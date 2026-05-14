import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { StudentResult } from './student-result.entity';

@Entity('answer_entries')
export class AnswerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => StudentResult, (r) => r.entries, { onDelete: 'CASCADE' })
  result: StudentResult;

  @Column()
  questionId: string;

  @Column('text')
  questionText: string;

  @Column('text')
  studentAnswer: string;

  @Column({ type: 'text', nullable: true })   // ← nullable: referenceAnswer may not exist
  referenceAnswer: string;

  @Column('float')
  aiMark: number;

  @Column()
  maxMarks: number;

  @Column('float')
  confidence: number;

  @Column('float')
  semanticScore: number;

  @Column('float')
  keywordScore: number;

  @Column({ nullable: true })
  isCorrect: boolean;

  @Column({ default: false })
  isFlagged: boolean;

  @Column({ nullable: true, type: 'float' })
  approvedMark: number;

  @Column()
  type: 'mcq' | 'descriptive';
}