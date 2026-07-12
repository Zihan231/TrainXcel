import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index, DeleteDateColumn } from 'typeorm';
import { Course } from './course.entity';

@Entity('lessons')
export class Lesson {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  title: string;

  @Column({ unique: true })
  lessonId: string; // e.g. 'L-TS-01'

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column()
  materialType: string; // 'Video' | 'PDF' | 'PPT'

  @Column()
  materialLink: string;

  @Column({ default: 'Draft' })
  status: string; // 'Active' | 'Draft'

  @ManyToOne(() => Course, (course) => course.lessons, { onDelete: 'CASCADE' })
  course: Course;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
