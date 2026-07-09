import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Category } from './category.entity';
import { Lesson } from './lesson.entity';
import { Enrollment } from './enrollment.entity';

@Entity('courses')
export class Course {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  courseId: string; // e.g. 'TS-101'

  @Column({ default: 0 })
  enrolled: number;

  @Column({ default: 'draft' })
  status: string; // 'active' | 'inactive' | 'draft'

  @ManyToOne(() => Category, (category) => category.courses, { onDelete: 'SET NULL', nullable: true })
  category: Category | null;

  @OneToMany(() => Lesson, (lesson) => lesson.course, { cascade: true })
  lessons: Lesson[];

  @OneToMany(() => Enrollment, (enrollment) => enrollment.course)
  enrollments: Enrollment[];

  // This will be populated dynamically by the service
  completionRate?: number;
}
