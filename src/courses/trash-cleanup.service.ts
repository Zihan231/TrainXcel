import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Course } from './entities/course.entity';
import { Lesson } from './entities/lesson.entity';

@Injectable()
export class TrashCleanupService {
  private readonly logger = new Logger(TrashCleanupService.name);

  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  // Run daily at midnight to purge items deleted more than 30 days ago
  @Cron('0 0 * * *')
  async purgeExpiredTrash() {
    const cutoffDate = new Date();
    // Cutoff time is 30 days
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    // 1. Purge expired soft-deleted lessons
    const expiredLessons = await this.lessonRepository.find({
      where: { deletedAt: LessThan(cutoffDate) },
      withDeleted: true,
    });

    if (expiredLessons.length > 0) {
      this.logger.log(`Purging ${expiredLessons.length} expired soft-deleted lessons...`);
      await this.lessonRepository.delete(expiredLessons.map(l => l.id));
    }

    // 2. Purge expired soft-deleted courses
    const expiredCourses = await this.courseRepository.find({
      where: { deletedAt: LessThan(cutoffDate) },
      withDeleted: true,
    });

    if (expiredCourses.length > 0) {
      this.logger.log(`Purging ${expiredCourses.length} expired soft-deleted courses...`);
      await this.courseRepository.delete(expiredCourses.map(c => c.id));
    }
  }
}
