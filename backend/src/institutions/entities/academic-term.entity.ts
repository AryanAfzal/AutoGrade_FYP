import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type AcademicTermStatus = 'UPCOMING' | 'ACTIVE' | 'CLOSED';

@Entity('academic_terms')
export class AcademicTerm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'boolean', default: false })
  current: boolean;

  @Column({ default: 'UPCOMING' })
  status: AcademicTermStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
