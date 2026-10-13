import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { StudentResult } from './student-result.entity';
import { ReviewAudit } from './review-audit.entity';

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

  @Column({ default: 'pending' })
  reviewStatus: 'pending' | 'approved' | 'overridden';

  @Column()
  type: 'mcq' | 'descriptive';

  @OneToMany(() => ReviewAudit, (audit) => audit.answerEntry)
  reviewAuditTrail: ReviewAudit[];

  @Column('jsonb', { nullable: true })
  rubricBreakdown: {
    conceptName: string;
    maxMarks: number;
    coverage: number;
    awardedMarks: number;
    status: 'addressed' | 'partially addressed' | 'not addressed';
    strictness: 'lenient' | 'balanced' | 'strict';
  }[] | null;

  @Column({ type: 'float', nullable: true })
  conceptScore: number | null;

  @Column({ type: 'text', nullable: true })
  feedback: string | null;
}