import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { Course } from './entities/course.entity';
import { Lesson } from './entities/lesson.entity';
import { Category } from './entities/category.entity';
import { Enrollment } from './entities/enrollment.entity';
import { Test } from './entities/test.entity';
import { Question } from './entities/question.entity';
import { TestSubmission } from './entities/test-submission.entity';
import { SubmissionAnswer } from './entities/submission-answer.entity';
import { Notification } from './entities/notification.entity';
import { User } from '../auth/entities/user.entity';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { TrashCleanupService } from './trash-cleanup.service';
import { TestsService } from './tests.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsController } from './notifications.controller';
import { ExamSchedulerService } from './exam-scheduler.service';

import { MediaProcessorService } from './media-processor.service';
// import { SpeechService } from './speech.service';
import { TestsController } from './tests.controller';
import { GeminiAnalysisService } from './gemini-analysis.service';
import { CloudStorageService } from './cloud-storage.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([Course, Lesson, Category, Enrollment, User, Test, Question, TestSubmission, SubmissionAnswer, Notification]),
    AuthModule,
    ConfigModule,
  ],
  controllers: [CoursesController, NotificationsController, TestsController],
  providers: [
    CoursesService, 
    TrashCleanupService, 
    TestsService, 
    ExamSchedulerService, 
    NotificationsGateway,
    // SpeechService,
    MediaProcessorService,
    GeminiAnalysisService,
    CloudStorageService,
  ],
  exports: [CoursesService, TestsService, NotificationsGateway],
})
export class CoursesModule {}