import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  // --- Statistics & Analytics ---
  @Get('stats/dashboard')
  async getDashboardStats() {
    return this.coursesService.getDashboardStats();
  }

  @Get('stats/monthly-progress')
  async getMonthlyProgress() {
    return this.coursesService.getMonthlyProgress();
  }

  @Get('stats/course-progress-comparison')
  async getCourseProgressComparison() {
    return this.coursesService.getCourseProgressComparison();
  }

  @Get('stats/performance')
  async getCoursePerformance() {
    return this.coursesService.getCoursePerformance();
  }

  @Get('stats/user-performance')
  async getUserPerformance() {
    return this.coursesService.getUserPerformance();
  }

  @Get('stats/categories')
  async getCategoryStats() {
    return this.coursesService.getCategoryStats();
  }

  @Get('stats/materials')
  async getMaterialStats() {
    return this.coursesService.getMaterialStats();
  }

  @Get('stats/at-risk')
  async getAtRiskLearners() {
    return this.coursesService.getAtRiskLearners();
  }

  @Get('stats/recent-activity')
  async getRecentActivity() {
    return this.coursesService.getRecentActivity();
  }

  // --- Search ---
  @Get('search/unified')
  async searchUnified(@Query('q') q: string) {
    return this.coursesService.searchUnified(q || '');
  }

  @Get('search')
  async searchCoursesOnly(@Query('q') q: string) {
    return this.coursesService.searchCoursesOnly(q || '');
  }

  // --- Categories ---
  @Get('categories')
  async getCategories() {
    return this.coursesService.getAllCategories();
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createCategory(@Body() createCategoryDto: CreateCategoryDto) {
    return this.coursesService.createCategory(createCategoryDto);
  }

  // --- Courses ---
  @Get()
  async getCourses(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 6,
    @Query('categoryId') categoryId?: number,
    @Query('status') status?: string,
  ) {
    return this.coursesService.getCoursesPaginated(
      Number(page),
      Number(limit),
      categoryId ? Number(categoryId) : undefined,
      status,
    );
  }

  @Get(':courseId')
  async getCourse(@Param('courseId') courseId: string) {
    return this.coursesService.getCourseById(courseId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createCourse(@Body() createCourseDto: CreateCourseDto, @Req() req: any) {
    createCourseDto.userId = req.user.userId;
    return this.coursesService.createCourse(createCourseDto);
  }

  @Patch(':courseId')
  @UseGuards(JwtAuthGuard)
  async updateCourse(
    @Param('courseId') courseId: string,
    @Body() updateCourseDto: UpdateCourseDto,
    @Req() req: any,
  ) {
    updateCourseDto.userId = req.user.userId;
    return this.coursesService.updateCourse(courseId, updateCourseDto);
  }

  // --- Lessons ---
  @Post(':courseId/lessons')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async addLesson(
    @Param('courseId') courseId: string,
    @Body() createLessonDto: CreateLessonDto,
    @Req() req: any,
  ) {
    createLessonDto.userId = req.user.userId;
    return this.coursesService.addLessonToCourse(courseId, createLessonDto);
  }

  @Patch(':courseId/lessons/:lessonId')
  @UseGuards(JwtAuthGuard)
  async updateLesson(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Body() updateLessonDto: UpdateLessonDto,
    @Req() req: any,
  ) {
    updateLessonDto.userId = req.user.userId;
    return this.coursesService.updateLesson(courseId, lessonId, updateLessonDto);
  }

  // --- Enrollment & Progress ---
  @Post(':courseId/enroll')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async enrollUser(@Param('courseId') courseId: string, @Req() req: any) {
    return this.coursesService.enrollUser(courseId, req.user.userId);
  }

  @Post(':courseId/lessons/:lessonId/complete')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async completeLesson(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: any,
  ) {
    return this.coursesService.completeLesson(courseId, lessonId, req.user.userId);
  }

  @Get(':courseId/progress/:userId')
  async getProgress(@Param('courseId') courseId: string, @Param('userId') userId: string) {
    return this.coursesService.getUserProgress(courseId, userId);
  }
}
