import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { Course } from './entities/course.entity';
import { Lesson } from './entities/lesson.entity';
import { Category } from './entities/category.entity';
import { Enrollment } from './entities/enrollment.entity';
import { User } from '../auth/entities/user.entity';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Course, Lesson, Category, Enrollment, User]),
    AuthModule,
    ConfigModule,
  ],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
