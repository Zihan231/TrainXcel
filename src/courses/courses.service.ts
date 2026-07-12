import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, LessThan, MoreThanOrEqual, ILike } from 'typeorm';
import { Course } from './entities/course.entity';
import { Lesson } from './entities/lesson.entity';
import { Category } from './entities/category.entity';
import { Enrollment } from './entities/enrollment.entity';
import { User } from '../auth/entities/user.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}



  private async generateNextCourseId(): Promise<string> {
    const lastCourse = await this.courseRepository.findOne({
      where: {},
      withDeleted: true,
      order: { id: 'DESC' },
    });
    if (!lastCourse) {
      return 'CRS-0001';
    }
    const match = lastCourse.courseId.match(/CRS-(\d+)/);
    const nextNum = match ? parseInt(match[1]) + 1 : 1;
    return `CRS-${String(nextNum).padStart(4, '0')}`;
  }

  private async generateNextLessonId(): Promise<string> {
    const lastLesson = await this.lessonRepository.findOne({
      where: {},
      withDeleted: true,
      order: { id: 'DESC' },
    });
    if (!lastLesson) {
      return 'LES-0001';
    }
    const match = lastLesson.lessonId.match(/LES-(\d+)/);
    const nextNum = match ? parseInt(match[1]) + 1 : 1;
    return `LES-${String(nextNum).padStart(4, '0')}`;
  }



  // --- Category Logic ---
  async getAllCategories(): Promise<Category[]> {
    return this.categoryRepository.find();
  }

  async createCategory(createCategoryDto: CreateCategoryDto): Promise<Category> {
    const existing = await this.categoryRepository.findOne({ where: { name: createCategoryDto.name } });
    if (existing) {
      throw new ConflictException('Category name already exists');
    }
    const cat = this.categoryRepository.create(createCategoryDto);
    return this.categoryRepository.save(cat);
  }

  // --- Course Logic ---
  private calculateOverallCompletionRate(course: Course): number {
    if (!course.enrollments || course.enrollments.length === 0) {
      return 0;
    }
    const totalProgress = course.enrollments.reduce((sum, enrollment) => sum + enrollment.progress, 0);
    return Math.round((totalProgress / course.enrollments.length) * 100) / 100;
  }

  async getAllCourses(): Promise<Course[]> {
    const courses = await this.courseRepository.find({
      relations: {
        category: true,
        lessons: true,
        enrollments: true,
      },
    });

    return courses.map((course) => {
      course.completionRate = this.calculateOverallCompletionRate(course);
      return course;
    });
  }

  async getCoursesPaginated(
    page: number = 1,
    limit: number = 6,
    categoryId?: number,
    status?: string,
    q?: string,
  ): Promise<{ data: any[]; meta: any }> {
    const skippedItems = (page - 1) * limit;

    let where: any;
    if (q) {
      // Search matches name OR courseId, combined with category and status filters
      where = [
        {
          name: ILike(`%${q}%`),
          ...(categoryId ? { category: { id: categoryId } } : {}),
          ...(status ? { status } : {}),
        },
        {
          courseId: ILike(`%${q}%`),
          ...(categoryId ? { category: { id: categoryId } } : {}),
          ...(status ? { status } : {}),
        },
      ];
    } else {
      where = {};
      if (categoryId) {
        where.category = { id: categoryId };
      }
      if (status) {
        where.status = status;
      }
    }

    const [courses, total] = await Promise.all([
      this.courseRepository.find({
        where,
        skip: skippedItems,
        take: limit,
        relations: {
          category: true,
          lessons: true,
        },
        select: {
          id: true,
          name: true,
          courseId: true,
          enrolled: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          category: {
            id: true,
            name: true,
          },
          lessons: {
            id: true, // Only fetch lesson IDs to count them
          },
        },
        order: {
          createdAt: 'DESC',
        },
      }),
      this.courseRepository.count({ where }),
    ]);

    const data = courses.map((course) => {
      const { lessons, ...courseData } = course;
      return {
        ...courseData,
        totalLessons: lessons ? lessons.length : 0,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        totalItems: total,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }

  async getCourseById(courseId: string): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: { courseId },
      withDeleted: true,
      relations: {
        category: true,
        lessons: true,
        enrollments: true,
      },
    });

    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    course.completionRate = this.calculateOverallCompletionRate(course);
    return course;
  }

  async createCourse(createCourseDto: CreateCourseDto, requesterId: string): Promise<Course> {
    // Always verify role from DB using the JWT-authenticated userId — never trust client body
    const requester = await this.userRepository.findOne({ where: { userId: requesterId } });
    if (!requester) {
      throw new NotFoundException(`Authenticated user ${requesterId} not found`);
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException('Only admin and employee users can create courses');
    }

    const courseId = await this.generateNextCourseId();

    let category: Category | null = null;
    if (createCourseDto.categoryId) {
      category = await this.categoryRepository.findOne({ where: { id: createCourseDto.categoryId } });
      if (!category) {
        throw new NotFoundException(`Category with ID ${createCourseDto.categoryId} not found`);
      }
    }

    const course = this.courseRepository.create({
      ...createCourseDto,
      courseId,
      category,
    });

    return this.courseRepository.save(course);
  }

  async updateCourse(courseId: string, updateCourseDto: UpdateCourseDto, requesterId: string): Promise<Course> {
    // Always verify role from DB using the JWT-authenticated userId
    const requester = await this.userRepository.findOne({ where: { userId: requesterId } });
    if (!requester) {
      throw new NotFoundException(`Authenticated user ${requesterId} not found`);
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException('Only admin and employee users can update courses');
    }

    const course = await this.courseRepository.findOne({ where: { courseId } });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    if (updateCourseDto.categoryId) {
      const category = await this.categoryRepository.findOne({ where: { id: updateCourseDto.categoryId } });
      if (!category) {
        throw new NotFoundException(`Category with ID ${updateCourseDto.categoryId} not found`);
      }
      course.category = category;
    }

    Object.assign(course, updateCourseDto);
    return this.courseRepository.save(course);
  }

  async updateCourseStatus(courseId: string, status: string, userId: string): Promise<Course> {
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    if (user.role !== 'admin' && user.role !== 'employee') {
      throw new ForbiddenException('Only admin and employee users can update course status');
    }

    if (status !== 'active' && status !== 'inactive' && status !== 'draft') {
      throw new BadRequestException('Invalid course status. Must be active, inactive, or draft');
    }

    const course = await this.courseRepository.findOne({ where: { courseId } });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    course.status = status;
    return this.courseRepository.save(course);
  }

  async deleteCourse(courseId: string, requesterId: string): Promise<{ message: string }> {
    const requester = await this.userRepository.findOne({ where: { userId: requesterId } });
    if (!requester) {
      throw new NotFoundException(`Authenticated user ${requesterId} not found`);
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException('Only admin and employee users can delete courses');
    }

    const course = await this.courseRepository.findOne({ where: { courseId } });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    await this.courseRepository.softRemove(course);
    return { message: 'Course successfully moved to recycle bin' };
  }

  async restoreCourse(courseId: string, requesterId: string): Promise<{ message: string }> {
    const requester = await this.userRepository.findOne({ where: { userId: requesterId } });
    if (!requester) {
      throw new NotFoundException(`Authenticated user ${requesterId} not found`);
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException('Only admin and employee users can restore courses');
    }

    const course = await this.courseRepository.findOne({
      where: { courseId },
      withDeleted: true,
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    await this.courseRepository.restore(course.id);
    return { message: 'Course successfully restored' };
  }

  async hardDeleteCourse(courseId: string, requesterId: string): Promise<{ message: string }> {
    const requester = await this.userRepository.findOne({ where: { userId: requesterId } });
    if (!requester) {
      throw new NotFoundException(`Authenticated user ${requesterId} not found`);
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException('Only admin and employee users can permanently delete courses');
    }

    const course = await this.courseRepository.findOne({
      where: { courseId },
      withDeleted: true,
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    await this.courseRepository.delete(course.id);
    return { message: 'Course permanently deleted' };
  }

  // --- Lesson Logic ---
  async getLessonById(courseId: string, lessonId: string): Promise<Lesson> {
    const course = await this.courseRepository.findOne({ where: { courseId }, withDeleted: true });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const lesson = await this.lessonRepository.findOne({
      where: { lessonId, course: { id: course.id } },
      withDeleted: true, // Allow fetching if it's soft-deleted
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson with ID ${lessonId} not found in course ${courseId}`);
    }

    return lesson;
  }

  async getLessonsByCourseId(courseId: string): Promise<Lesson[]> {
    const course = await this.courseRepository.findOne({ where: { courseId }, withDeleted: true });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    return this.lessonRepository.find({
      where: { course: { id: course.id } },
      withDeleted: true,
      select: {
        id: true,
        lessonId: true,
        title: true,
        description: true,
        materialType: true,
        materialLink: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
      order: {
        id: 'ASC',
      },
    });
  }

  async addLessonToCourse(courseId: string, createLessonDto: CreateLessonDto, requesterId: string): Promise<Lesson> {
    // Always verify role from DB using the JWT-authenticated userId
    const requester = await this.userRepository.findOne({ where: { userId: requesterId } });
    if (!requester) {
      throw new NotFoundException(`Authenticated user ${requesterId} not found`);
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException('Only admin and employee users can add lessons to courses');
    }

    const course = await this.courseRepository.findOne({
      where: { courseId },
      relations: {
        lessons: true,
        enrollments: true,
      },
    });

    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const lessonId = await this.generateNextLessonId();

    const lesson = this.lessonRepository.create({
      ...createLessonDto,
      lessonId,
      course,
    });

    const savedLesson = await this.lessonRepository.save(lesson);

    // After adding a new lesson, recalculate progress for all enrolled users
    if (course.enrollments && course.enrollments.length > 0) {
      const updatedTotalLessons = course.lessons.length + 1;
      for (const enrollment of course.enrollments) {
        const completedCount = enrollment.completedLessons ? enrollment.completedLessons.length : 0;
        enrollment.progress = Math.round((completedCount / updatedTotalLessons) * 100 * 100) / 100;
        await this.enrollmentRepository.save(enrollment);
      }
    }

    return savedLesson;
  }

  async updateLesson(courseId: string, lessonId: string, updateLessonDto: UpdateLessonDto, requesterId: string): Promise<Lesson> {
    // Always verify role from DB using the JWT-authenticated userId
    const requester = await this.userRepository.findOne({ where: { userId: requesterId } });
    if (!requester) {
      throw new NotFoundException(`Authenticated user ${requesterId} not found`);
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException('Only admin and employee users can update lessons');
    }

    const lesson = await this.lessonRepository.findOne({
      where: { lessonId, course: { courseId } },
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} belonging to course ${courseId} not found`);
    }

    Object.assign(lesson, updateLessonDto);
    return this.lessonRepository.save(lesson);
  }

  async deleteLesson(courseId: string, lessonId: string, requesterId: string): Promise<{ message: string }> {
    const requester = await this.userRepository.findOne({ where: { userId: requesterId } });
    if (!requester) {
      throw new NotFoundException(`Authenticated user ${requesterId} not found`);
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException('Only admin and employee users can delete lessons');
    }

    const course = await this.courseRepository.findOne({
      where: { courseId },
      relations: {
        lessons: true,
        enrollments: {
          completedLessons: true,
        },
      },
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const lesson = await this.lessonRepository.findOne({
      where: { lessonId, course: { id: course.id } },
    });
    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} belonging to course ${courseId} not found`);
    }

    const remainingLessonsCount = course.lessons.length - 1;
    if (course.enrollments && course.enrollments.length > 0) {
      for (const enrollment of course.enrollments) {
        const hadCompleted = enrollment.completedLessons.some((cl) => cl.id === lesson.id);
        if (hadCompleted) {
          enrollment.completedLessons = enrollment.completedLessons.filter((cl) => cl.id !== lesson.id);
        }

        const completedCount = enrollment.completedLessons.length;
        if (remainingLessonsCount > 0) {
          enrollment.progress = Math.round((completedCount / remainingLessonsCount) * 100 * 100) / 100;
        } else {
          enrollment.progress = 0;
        }
        await this.enrollmentRepository.save(enrollment);
      }
    }

    await this.lessonRepository.softRemove(lesson);
    return { message: 'Lesson successfully moved to recycle bin' };
  }

  async restoreLesson(courseId: string, lessonId: string, requesterId: string): Promise<{ message: string }> {
    const requester = await this.userRepository.findOne({ where: { userId: requesterId } });
    if (!requester) {
      throw new NotFoundException(`Authenticated user ${requesterId} not found`);
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException('Only admin and employee users can restore lessons');
    }

    const course = await this.courseRepository.findOne({
      where: { courseId },
      relations: {
        lessons: true,
        enrollments: {
          completedLessons: true,
        },
      },
      withDeleted: true,
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const lesson = await this.lessonRepository.findOne({
      where: { lessonId, course: { id: course.id } },
      withDeleted: true,
    });
    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} belonging to course ${courseId} not found`);
    }

    await this.lessonRepository.restore(lesson.id);

    const activeLessons = await this.lessonRepository.count({ where: { course: { id: course.id } } });
    if (course.enrollments && course.enrollments.length > 0) {
      for (const enrollment of course.enrollments) {
        const completedCount = enrollment.completedLessons.length;
        enrollment.progress = Math.round((completedCount / activeLessons) * 100 * 100) / 100;
        await this.enrollmentRepository.save(enrollment);
      }
    }

    return { message: 'Lesson successfully restored' };
  }

  async hardDeleteLesson(courseId: string, lessonId: string, requesterId: string): Promise<{ message: string }> {
    const requester = await this.userRepository.findOne({ where: { userId: requesterId } });
    if (!requester) {
      throw new NotFoundException(`Authenticated user ${requesterId} not found`);
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException('Only admin and employee users can permanently delete lessons');
    }

    const course = await this.courseRepository.findOne({
      where: { courseId },
      relations: {
        lessons: true,
        enrollments: {
          completedLessons: true,
        },
      },
      withDeleted: true,
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const lesson = await this.lessonRepository.findOne({
      where: { lessonId, course: { id: course.id } },
      withDeleted: true,
    });
    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} belonging to course ${courseId} not found`);
    }

    const isAlreadySoftDeleted = lesson.deletedAt !== null;
    if (!isAlreadySoftDeleted) {
      const remainingLessonsCount = course.lessons.length - 1;
      if (course.enrollments && course.enrollments.length > 0) {
        for (const enrollment of course.enrollments) {
          const hadCompleted = enrollment.completedLessons.some((cl) => cl.id === lesson.id);
          if (hadCompleted) {
            enrollment.completedLessons = enrollment.completedLessons.filter((cl) => cl.id !== lesson.id);
          }

          const completedCount = enrollment.completedLessons.length;
          if (remainingLessonsCount > 0) {
            enrollment.progress = Math.round((completedCount / remainingLessonsCount) * 100 * 100) / 100;
          } else {
            enrollment.progress = 0;
          }
          await this.enrollmentRepository.save(enrollment);
        }
      }
    }

    await this.lessonRepository.delete(lesson.id);
    return { message: 'Lesson permanently deleted' };
  }

  // --- Enrollment & Progress Logic ---
  async enrollUser(courseId: string, userId: string): Promise<Enrollment> {
    const course = await this.courseRepository.findOne({
      where: { courseId },
      relations: {
        lessons: true,
      },
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }
    if (course.status !== 'active') {
      throw new BadRequestException(`Cannot enroll in a course that is in "${course.status}" status`);
    }

    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const existingEnrollment = await this.enrollmentRepository.findOne({
      where: { user: { id: user.id }, course: { id: course.id } },
    });
    if (existingEnrollment) {
      throw new ConflictException('User is already enrolled in this course');
    }

    const enrollment = this.enrollmentRepository.create({
      user,
      course,
      completedLessons: [],
      progress: 0.0,
    });

    const savedEnrollment = await this.enrollmentRepository.save(enrollment);

    course.enrolled += 1;
    await this.courseRepository.save(course);

    return savedEnrollment;
  }

  async completeLesson(courseId: string, lessonId: string, userId: string): Promise<Enrollment> {
    const course = await this.courseRepository.findOne({
      where: { courseId },
      relations: {
        lessons: true,
      },
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }
    if (course.status !== 'active') {
      throw new BadRequestException(`Cannot complete lessons for a course that is in "${course.status}" status`);
    }

    const lesson = await this.lessonRepository.findOne({
      where: { lessonId, course: { id: course.id } },
    });
    if (!lesson) {
      throw new NotFoundException(`Lesson with ID ${lessonId} belonging to course ${courseId} not found`);
    }

    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const enrollment = await this.enrollmentRepository.findOne({
      where: { user: { id: user.id }, course: { id: course.id } },
      relations: {
        completedLessons: true,
        course: {
          lessons: true,
        },
      },
    });

    if (!enrollment) {
      throw new BadRequestException(`User with ID ${userId} is not enrolled in course ${courseId}`);
    }

    const alreadyCompleted = enrollment.completedLessons.some((cl) => cl.id === lesson.id);
    if (!alreadyCompleted) {
      enrollment.completedLessons.push(lesson);
      
      const totalLessons = enrollment.course.lessons.length;
      const completedCount = enrollment.completedLessons.length;
      enrollment.progress = Math.round((completedCount / totalLessons) * 100 * 100) / 100;

      await this.enrollmentRepository.save(enrollment);
    }

    return enrollment;
  }

  async getUserProgress(courseId: string, userId: string): Promise<{ progress: number; completedLessonsCount: number; totalLessonsCount: number }> {
    const course = await this.courseRepository.findOne({
      where: { courseId },
      relations: {
        lessons: true,
      },
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const enrollment = await this.enrollmentRepository.findOne({
      where: { user: { id: user.id }, course: { id: course.id } },
      relations: {
        completedLessons: true,
      },
    });

    if (!enrollment) {
      throw new NotFoundException(`User with ID ${userId} is not enrolled in course ${courseId}`);
    }

    return {
      progress: enrollment.progress,
      completedLessonsCount: enrollment.completedLessons.length,
      totalLessonsCount: course.lessons.length,
    };
  }

  // --- Search Logic ---
  async searchUnified(query: string): Promise<{ courses: any[]; employees: Omit<User, 'password'>[] }> {
    const courses = await this.courseRepository.find({
      where: [
        { name: ILike(`%${query}%`) },
        { courseId: ILike(`%${query}%`) },
      ],
      relations: { category: true, lessons: true },
      select: {
        id: true,
        name: true,
        courseId: true,
        enrolled: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        category: {
          id: true,
          name: true,
        },
        lessons: {
          id: true,
        },
      },
      order: {
        createdAt: 'DESC',
      },
    });

    const employees = await this.userRepository.find({
      where: [
        { role: 'employee', name: ILike(`%${query}%`) },
        { role: 'employee', email: ILike(`%${query}%`) },
        { role: 'employee', userId: ILike(`%${query}%`) },
      ],
    });

    const employeesWithoutPassword = employees.map(({ password, ...user }) => user);

    const mappedCourses = courses.map((course) => {
      const { lessons, ...courseData } = course;
      return {
        ...courseData,
        totalLessons: lessons ? lessons.length : 0,
      };
    });

    return {
      courses: mappedCourses,
      employees: employeesWithoutPassword,
    };
  }

  async searchCoursesOnly(query: string): Promise<any[]> {
    const courses = await this.courseRepository.find({
      where: [
        { name: ILike(`%${query}%`) },
        { courseId: ILike(`%${query}%`) },
      ],
      relations: { category: true, lessons: true },
      select: {
        id: true,
        name: true,
        courseId: true,
        enrolled: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        category: {
          id: true,
          name: true,
        },
        lessons: {
          id: true,
        },
      },
      order: {
        createdAt: 'DESC',
      },
    });

    return courses.map((course) => {
      const { lessons, ...courseData } = course;
      return {
        ...courseData,
        totalLessons: lessons ? lessons.length : 0,
      };
    });
  }

  // --- Statistics & Analytics ---
  async getDashboardStats(): Promise<{ totalUsers: number; totalCourses: number; totalEmployees: number; overallCompletionRate: number }> {
    const [totalUsers, totalCourses, totalEmployees, enrollments] = await Promise.all([
      this.userRepository.count(),
      this.courseRepository.count(),
      this.userRepository.count({ where: { role: 'employee' } }),
      this.enrollmentRepository.find({ select: { progress: true } }), // Only select progress to reduce DB bandwidth
    ]);
    
    const overallCompletionRate = enrollments.length > 0
      ? Math.round((enrollments.reduce((sum, e) => sum + e.progress, 0) / enrollments.length) * 100) / 100
      : 0;

    return {
      totalUsers,
      totalCourses,
      totalEmployees,
      overallCompletionRate,
    };
  }

  async getMonthlyProgress(): Promise<{ month: string; progress: number }[]> {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const enrollments = await this.enrollmentRepository.find({
      where: {
        createdAt: MoreThanOrEqual(twelveMonthsAgo),
      },
      order: {
        createdAt: 'ASC',
      },
    });

    if (enrollments.length === 0) {
      // Fallback placeholder data so graphs do not break when database is empty
      return [
        { month: 'Jan 2026', progress: 10.5 },
        { month: 'Feb 2026', progress: 24.0 },
        { month: 'Mar 2026', progress: 38.5 },
        { month: 'Apr 2026', progress: 51.0 },
        { month: 'May 2026', progress: 63.8 },
        { month: 'Jun 2026', progress: 78.4 },
      ];
    }

    const monthlyData: { [key: string]: { sum: number; count: number } } = {};

    enrollments.forEach((e) => {
      const date = new Date(e.createdAt);
      const monthName = date.toLocaleString('default', { month: 'short' }); // e.g. "Jul"
      const year = date.getFullYear(); // e.g. 2026
      const key = `${monthName} ${year}`;

      if (!monthlyData[key]) {
        monthlyData[key] = { sum: 0, count: 0 };
      }
      monthlyData[key].sum += e.progress;
      monthlyData[key].count++;
    });

    return Object.keys(monthlyData).map((key) => ({
      month: key,
      progress: Math.round((monthlyData[key].sum / monthlyData[key].count) * 100) / 100,
    }));
  }

  async getCourseProgressComparison(): Promise<{ courseId: string; name: string; enrolledCount: number; completionRate: number }[]> {
    const courses = await this.getAllCourses();
    return courses.map((c) => ({
      courseId: c.courseId,
      name: c.name,
      enrolledCount: c.enrolled,
      completionRate: c.completionRate || 0,
    }));
  }

  async getCoursePerformance(): Promise<any[]> {
    const courses = await this.getAllCourses();
    // Sort courses by completionRate DESC
    return courses
      .map((c) => ({
        courseId: c.courseId,
        name: c.name,
        category: c.category ? c.category.name : 'N/A',
        enrolledCount: c.enrolled,
        completionRate: c.completionRate || 0,
      }))
      .sort((a, b) => b.completionRate - a.completionRate);
  }

  async getUserPerformance(): Promise<any[]> {
    const users = await this.userRepository.find({
      relations: { enrollments: true },
    });

    return users.map((u) => {
      const completedCount = u.enrollments.filter((e) => e.progress === 100).length;
      const activeCount = u.enrollments.filter((e) => e.progress > 0 && e.progress < 100).length;
      const totalProgress = u.enrollments.reduce((sum, e) => sum + e.progress, 0);
      const avgProgress = u.enrollments.length > 0
        ? Math.round((totalProgress / u.enrollments.length) * 100) / 100
        : 0;

      return {
        userId: u.userId,
        name: u.name,
        email: u.email,
        role: u.role,
        completedCoursesCount: completedCount,
        activeCoursesCount: activeCount,
        averageProgress: avgProgress,
      };
    });
  }

  async getCategoryStats(): Promise<any[]> {
    const categories = await this.categoryRepository.find({
      relations: { courses: { enrollments: true } },
    });

    return categories.map((cat) => {
      let totalEnrolled = 0;
      let progressSum = 0;
      let totalEnrollmentRecords = 0;

      cat.courses.forEach((c) => {
        totalEnrolled += c.enrolled;
        c.enrollments.forEach((e) => {
          progressSum += e.progress;
          totalEnrollmentRecords++;
        });
      });

      const avgProgress = totalEnrollmentRecords > 0
        ? Math.round((progressSum / totalEnrollmentRecords) * 100) / 100
        : 0;

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        coursesCount: cat.courses.length,
        totalEnrolled,
        averageProgress: avgProgress,
      };
    });
  }

  async getMaterialStats(): Promise<any[]> {
    const lessons = await this.lessonRepository.find();
    const enrollments = await this.enrollmentRepository.find({
      relations: { completedLessons: true },
    });

    const materialMap = new Map<string, { count: number; completedCount: number }>();
    
    // Initialize map
    materialMap.set('Video', { count: 0, completedCount: 0 });
    materialMap.set('PDF', { count: 0, completedCount: 0 });
    materialMap.set('PPT', { count: 0, completedCount: 0 });

    lessons.forEach((l) => {
      const stats = materialMap.get(l.materialType) || { count: 0, completedCount: 0 };
      stats.count++;
      materialMap.set(l.materialType, stats);
    });

    enrollments.forEach((enr) => {
      enr.completedLessons.forEach((cl) => {
        const stats = materialMap.get(cl.materialType) || { count: 0, completedCount: 0 };
        stats.completedCount++;
        materialMap.set(cl.materialType, stats);
      });
    });

    return Array.from(materialMap.entries()).map(([materialType, stats]) => ({
      materialType,
      availableLessonsCount: stats.count,
      totalCompletedLessonsCount: stats.completedCount,
    }));
  }

  async getAtRiskLearners(): Promise<any[]> {
    const atRisk = await this.enrollmentRepository.find({
      where: { progress: LessThan(15.0) },
      relations: { user: true, course: true },
    });

    return atRisk.map((e) => ({
      userId: e.user.userId,
      name: e.user.name,
      email: e.user.email,
      courseId: e.course.courseId,
      courseName: e.course.name,
      progress: e.progress,
    }));
  }

  async getRecentActivity(): Promise<any[]> {
    const enrollments = await this.enrollmentRepository.find({
      relations: { user: true, course: true },
      order: { id: 'DESC' },
      take: 10,
    });

    return enrollments.map((e) => ({
      activityId: e.id,
      type: 'enrollment',
      userId: e.user.userId,
      userName: e.user.name,
      courseId: e.course.courseId,
      courseName: e.course.name,
      message: `${e.user.name} enrolled in ${e.course.name}`,
      timestamp: e.createdAt,
    }));
  }

  async getTrashItems(
    requesterId: string,
    q?: string,
    type?: 'course' | 'lesson',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
  ): Promise<any[]> {
    const requester = await this.userRepository.findOne({ where: { userId: requesterId } });
    if (!requester) {
      throw new NotFoundException(`Authenticated user ${requesterId} not found`);
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException('Only admin and employee users can view recycle bin');
    }

    const trashItems: any[] = [];

    // 1. Fetch soft-deleted courses if type matches
    if (!type || type === 'course') {
      const coursesQuery = this.courseRepository.createQueryBuilder('course')
        .withDeleted()
        .where('course.deletedAt IS NOT NULL')
        .leftJoinAndSelect('course.category', 'category');

      if (q) {
        coursesQuery.andWhere(
          '(course.name ILike :q OR course.courseId ILike :q)',
          { q: `%${q}%` }
        );
      }

      const courses = await coursesQuery.getMany();
      courses.forEach(c => {
        trashItems.push({
          id: c.courseId,
          courseId: c.courseId, // Added for frontend compatibility
          dbId: c.id,
          type: 'course',
          name: c.name,
          deletedAt: c.deletedAt,
          category: c.category ? c.category.name : null,
        });
      });
    }

    // 2. Fetch soft-deleted lessons if type matches
    if (!type || type === 'lesson') {
      const lessonsQuery = this.lessonRepository.createQueryBuilder('lesson')
        .withDeleted()
        .where('lesson.deletedAt IS NOT NULL')
        .leftJoinAndSelect('lesson.course', 'course');

      if (q) {
        lessonsQuery.andWhere(
          '(lesson.title ILike :q OR lesson.lessonId ILike :q)',
          { q: `%${q}%` }
        );
      }

      const lessons = await lessonsQuery.getMany();
      lessons.forEach(l => {
        trashItems.push({
          id: l.lessonId,
          lessonId: l.lessonId, // Added for frontend compatibility
          dbId: l.id,
          type: 'lesson',
          name: l.title,
          deletedAt: l.deletedAt,
          courseId: l.course ? l.course.courseId : null,
          courseName: l.course ? l.course.name : null,
        });
      });
    }

    // Sort combined items by deletedAt
    trashItems.sort((a, b) => {
      const dateA = new Date(a.deletedAt).getTime();
      const dateB = new Date(b.deletedAt).getTime();
      return sortOrder === 'DESC' ? dateB - dateA : dateA - dateB;
    });

    return trashItems;
  }

  async emptyRecycleBin(requesterId: string): Promise<{ message: string }> {
    const requester = await this.userRepository.findOne({ where: { userId: requesterId } });
    if (!requester) {
      throw new NotFoundException(`Authenticated user ${requesterId} not found`);
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException('Only admin and employee users can empty the recycle bin');
    }

    // Hard-delete all soft-deleted lessons
    await this.lessonRepository.createQueryBuilder()
      .delete()
      .from(Lesson)
      .where('deletedAt IS NOT NULL')
      .execute();

    // Hard-delete all soft-deleted courses
    await this.courseRepository.createQueryBuilder()
      .delete()
      .from(Course)
      .where('deletedAt IS NOT NULL')
      .execute();

    return { message: 'Recycle bin successfully emptied' };
  }
}
