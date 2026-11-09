import {
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';
import { RecheckRequest } from './recheck-request.entity';
import { User } from '../../users/entities/user.entity';

export type RecheckAuditAction = 'submitted' | 'upheld' | 'revised';

@Entity('recheck_audit')
export class RecheckAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => RecheckRequest, { nullable: false, onDelete: 'CASCADE' })
  request: RecheckRequest;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  actor: User;

  @Column()
  action: RecheckAuditAction;

  @Column({ type: 'float', nullable: true })
  previousMark: number | null;

  @Column({ type: 'float', nullable: true })
  finalMark: number | null;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
