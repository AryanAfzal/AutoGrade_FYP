import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Exam } from './exam.entity';

@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Exam, (e) => e.questions, { onDelete: 'CASCADE' })
  exam: Exam;

  @Column({ type: 'int', nullable: true })
  orderIndex: number | null;

  @Column()
  type: 'mcq' | 'descriptive';

  @Column('text')
  questionText: string;

  @Column()
  maxMarks: number;

  @Column()
  clo: string;

  @Column({ nullable: true })
  correctAnswer: string;

  @Column({ nullable: true })
  referenceAnswer: string;

  @Column('simple-array', { nullable: true })
  keywords: string[];

  @Column('jsonb', { nullable: true })
  options: { label: string; text: string }[];

  @Column('jsonb', { nullable: true })
  rubric: {
    concepts: {
      name: string;
      description: string;
      keywords: string[];
      maxMarks: number;
      strictness: 'lenient' | 'balanced' | 'strict';
    }[];
    scoringWeights: {
      semantic: number;
      keywords: number;
      concepts: number;
    };
  } | null;
}