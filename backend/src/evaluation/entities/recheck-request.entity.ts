import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AnswerEntry } from './answer-entry.entity';
import { User } from '../../users/entities/user.entity';

export type RecheckRequestStatus = 'pending' | 'upheld' | 'revised';
export type RecheckDecision = 'uphold' | 'revise';

@Entity('recheck_requests')
export class RecheckRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AnswerEntry, { nullable: false, onDelete: 'CASCADE' })
  answerEntry: AnswerEntry;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  student: User;

  @Column('text')
  justification: string;

  @Column('float')
  originalMark: number;

  @Column({ default: 'pending' })
  status: RecheckRequestStatus;

  @Column({ type: 'varchar', nullable: true })
  decision: RecheckDecision | null;

  @Column({ type: 'float', nullable: true })
  revisedMark: number | null;

  @Column({ type: 'text', nullable: true })
  decisionComment: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  reviewedBy: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;
}
