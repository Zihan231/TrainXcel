import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ExamGroup } from './exam-group.entity';

@Entity('exam_group_questions')
export class ExamGroupQuestion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  questionText: string;

  @Column({ type: 'jsonb' })
  options: string[];

  @Column({ type: 'jsonb' })
  correctAnswers: string[];

  @Column({ type: 'float', default: 1 })
  marks: number;

  @ManyToOne(() => ExamGroup, (examGroup) => examGroup.questions, {
    onDelete: 'CASCADE',
  })
  examGroup: ExamGroup;
}
