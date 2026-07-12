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

  // Run every 10 seconds to purge items deleted more than 1 minute ago (testing)
  @Cron('*/10 * * * * *')
  async purgeExpiredTrash() {
    const cutoffDate = new Date();
    // Cutoff time is 1 minute (60 seconds) - change to 30 days for production
    cutoffDate.setSeconds(cutoffDate.getSeconds() - 60);

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
