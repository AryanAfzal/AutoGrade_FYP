import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AnswerEntry } from './answer-entry.entity';
import { User } from '../../users/entities/user.entity';

@Entity('review_audit')
export class ReviewAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AnswerEntry, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'answerEntryId' })
  answerEntry: AnswerEntry;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reviewerId' })
  reviewer: User;

  @Column()
  action: 'approve' | 'override';

  @Column('float')
  originalAiMark: number;

  @Column('float')
  finalMark: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn()
  reviewedAt: Date;
}
