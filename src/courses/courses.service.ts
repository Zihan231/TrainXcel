import { Injectable, OnModuleInit, NotFoundException, ConflictException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
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
export class CoursesService implements OnModuleInit {
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

  async onModuleInit() {
    await this.seedMockData();
  }

  private async generateNextCourseId(): Promise<string> {
    const lastCourse = await this.courseRepository.findOne({
      where: {},
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
      order: { id: 'DESC' },
    });
    if (!lastLesson) {
      return 'LES-0001';
    }
    const match = lastLesson.lessonId.match(/LES-(\d+)/);
    const nextNum = match ? parseInt(match[1]) + 1 : 1;
    return `LES-${String(nextNum).padStart(4, '0')}`;
  }

  private async seedMockData() {
    // Clean up old mock data format or incomplete mock datasets
    const oldCourse = await this.courseRepository.findOne({ where: { courseId: 'TS-101' } as any });
    const courseCountBefore = await this.courseRepository.count();
    const hasFebSeed = await this.enrollmentRepository.findOne({
      where: {
        createdAt: new Date('2026-02-15T12:00:00Z'),
      },
    });

    if (oldCourse || (courseCountBefore > 0 && courseCountBefore < 4) || !hasFebSeed) {
      this.logger.log('Old or incomplete mock data found. Wiping database tables for re-seeding...');
      // Truncate categories and cascade down the foreign key chain to clear courses, lessons, and enrollments
      await this.categoryRepository.query('TRUNCATE TABLE "categories" CASCADE;');
      this.logger.log('Old mock data wiped.');
    }

    // 1. Seed Categories
    const categoryCount = await this.categoryRepository.count();
    if (categoryCount === 0) {
      this.logger.log('No categories found. Seeding categories...');
      const devCategory = this.categoryRepository.create({ name: 'Development' });
      const designCategory = this.categoryRepository.create({ name: 'Design' });
      const businessCategory = this.categoryRepository.create({ name: 'Business' });
      await this.categoryRepository.save([devCategory, designCategory, businessCategory]);
      this.logger.log('Categories seeded.');
    }

    // 2. Seed Courses & Lessons
    const courseCount = await this.courseRepository.count();
    if (courseCount === 0) {
      this.logger.log('No courses found. Seeding courses and lessons...');
      const devCategory = await this.categoryRepository.findOne({ where: { name: 'Development' } });
      const designCategory = await this.categoryRepository.findOne({ where: { name: 'Design' } });
      const businessCategory = await this.categoryRepository.findOne({ where: { name: 'Business' } });

      // Course 1: Development
      const course1 = this.courseRepository.create({
        name: 'Introduction to TypeScript',
        courseId: 'CRS-0001',
        status: 'active',
        category: devCategory,
        enrolled: 2,
      });
      const savedCourse1 = await this.courseRepository.save(course1);

      const lesson1_1 = this.lessonRepository.create({ title: 'Basic Types', lessonId: 'LES-0001', description: 'Learn string, number, array and tuple.', materialType: 'Video', materialLink: 'https://example.com/ts-basics.mp4', status: 'Active', course: savedCourse1 });
      const lesson1_2 = this.lessonRepository.create({ title: 'Interfaces and Types', lessonId: 'LES-0002', description: 'Defining custom structures.', materialType: 'PDF', materialLink: 'https://example.com/ts-interfaces.pdf', status: 'Active', course: savedCourse1 });
      const lesson1_3 = this.lessonRepository.create({ title: 'Generics', lessonId: 'LES-0003', description: 'Reusable component definitions.', materialType: 'PPT', materialLink: 'https://example.com/ts-generics.ppt', status: 'Active', course: savedCourse1 });
      const lesson1_4 = this.lessonRepository.create({ title: 'Decorators', lessonId: 'LES-0004', description: 'Annotations and meta-programming.', materialType: 'Video', materialLink: 'https://example.com/ts-decorators.mp4', status: 'Active', course: savedCourse1 });
      await this.lessonRepository.save([lesson1_1, lesson1_2, lesson1_3, lesson1_4]);

      // Course 2: Design
      const course2 = this.courseRepository.create({
        name: 'Advanced UI/UX Design',
        courseId: 'CRS-0002',
        status: 'active',
        category: designCategory,
        enrolled: 1,
      });
      const savedCourse2 = await this.courseRepository.save(course2);

      const lesson2_1 = this.lessonRepository.create({ title: 'Figma Auto-Layout Masterclass', lessonId: 'LES-0005', description: 'Master Auto-Layout 4.0 Components.', materialType: 'Video', materialLink: 'https://example.com/figma-layout.mp4', status: 'Active', course: savedCourse2 });
      const lesson2_2 = this.lessonRepository.create({ title: 'Design Systems in Figma', lessonId: 'LES-0006', description: 'Variables and design systems.', materialType: 'PDF', materialLink: 'https://example.com/design-systems.pdf', status: 'Active', course: savedCourse2 });
      const lesson2_3 = this.lessonRepository.create({ title: 'Prototyping Transitions', lessonId: 'LES-0007', description: 'Smart animate transitions.', materialType: 'Video', materialLink: 'https://example.com/prototyping.mp4', status: 'Active', course: savedCourse2 });
      await this.lessonRepository.save([lesson2_1, lesson2_2, lesson2_3]);

      // Course 3: Business
      const course3 = this.courseRepository.create({
        name: 'Product Management Essentials',
        courseId: 'CRS-0003',
        status: 'active',
        category: businessCategory,
        enrolled: 1,
      });
      const savedCourse3 = await this.courseRepository.save(course3);

      const lesson3_1 = this.lessonRepository.create({ title: 'Product Lifecycle', lessonId: 'LES-0008', description: 'Product lifecycle stages.', materialType: 'Video', materialLink: 'https://example.com/lifecycle.mp4', status: 'Active', course: savedCourse3 });
      const lesson3_2 = this.lessonRepository.create({ title: 'Agile and Scrum Basics', lessonId: 'LES-0009', description: 'Scrum frameworks & sprints.', materialType: 'PDF', materialLink: 'https://example.com/agile.pdf', status: 'Active', course: savedCourse3 });
      const lesson3_3 = this.lessonRepository.create({ title: 'KPIs and Metrics', lessonId: 'LES-0010', description: 'Tracking product success metrics.', materialType: 'PPT', materialLink: 'https://example.com/kpi.ppt', status: 'Active', course: savedCourse3 });
      await this.lessonRepository.save([lesson3_1, lesson3_2, lesson3_3]);

      // Course 4: Development (Next.js)
      const course4 = this.courseRepository.create({
        name: 'Next.js Core Concepts',
        courseId: 'CRS-0004',
        status: 'active',
        category: devCategory,
        enrolled: 1,
      });
      const savedCourse4 = await this.courseRepository.save(course4);

      const lesson4_1 = this.lessonRepository.create({ title: 'Server vs Client Components', lessonId: 'LES-0011', description: 'React Server Components (RSC).', materialType: 'Video', materialLink: 'https://example.com/rsc.mp4', status: 'Active', course: savedCourse4 });
      const lesson4_2 = this.lessonRepository.create({ title: 'Routing & Layouts', lessonId: 'LES-0012', description: 'Next.js App Router layout structure.', materialType: 'PDF', materialLink: 'https://example.com/routing.pdf', status: 'Active', course: savedCourse4 });
      const lesson4_3 = this.lessonRepository.create({ title: 'Data Fetching & Caching', lessonId: 'LES-0013', description: 'Caching strategy and revalidation.', materialType: 'Video', materialLink: 'https://example.com/fetching.mp4', status: 'Active', course: savedCourse4 });
      await this.lessonRepository.save([lesson4_1, lesson4_2, lesson4_3]);

      this.logger.log('Courses and lessons seeded.');

      // 3. Seed Enrollments and Progress
      const defaultUser = await this.userRepository.findOne({ where: { userId: 'TX-0001' } });
      const employeeUser = await this.userRepository.findOne({ where: { userId: 'TX-0002' } });

      if (defaultUser) {
        // user@example.com progress
        const enr1 = this.enrollmentRepository.create({
          user: defaultUser,
          course: savedCourse1,
          completedLessons: [lesson1_1, lesson1_2], // 2 of 4 completed
          progress: 50.0,
          createdAt: new Date('2026-02-15T12:00:00Z'),
        });

        const enr2 = this.enrollmentRepository.create({
          user: defaultUser,
          course: savedCourse2,
          completedLessons: [lesson2_1, lesson2_2, lesson2_3], // 3 of 3 completed
          progress: 100.0,
          createdAt: new Date('2026-03-20T12:00:00Z'),
        });

        const enr3 = this.enrollmentRepository.create({
          user: defaultUser,
          course: savedCourse4,
          completedLessons: [lesson4_1], // 1 of 3 completed
          progress: 33.33,
          createdAt: new Date('2026-04-10T12:00:00Z'),
        });

        await this.enrollmentRepository.save([enr1, enr2, enr3]);
      }

      if (employeeUser) {
        // employee@example.com progress
        const enr4 = this.enrollmentRepository.create({
          user: employeeUser,
          course: savedCourse1,
          completedLessons: [lesson1_1, lesson1_2, lesson1_3, lesson1_4], // 4 of 4 completed
          progress: 100.0,
          createdAt: new Date('2026-05-05T12:00:00Z'),
        });

        const enr5 = this.enrollmentRepository.create({
          user: employeeUser,
          course: savedCourse3,
          completedLessons: [lesson3_1], // 1 of 3 completed
          progress: 33.33,
          createdAt: new Date('2026-06-18T12:00:00Z'),
        });

        await this.enrollmentRepository.save([enr4, enr5]);
      }

      this.logger.log('Enrollments and user progress rates seeded.');
    }
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

  async getCoursesPaginated(page: number = 1, limit: number = 6): Promise<{ data: any[]; meta: any }> {
    const skippedItems = (page - 1) * limit;

    const [courses, total] = await Promise.all([
      this.courseRepository.find({
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
          category: {
            id: true,
            name: true,
          },
          lessons: {
            id: true, // Only fetch lesson IDs to count them
          },
        },
        order: {
          id: 'ASC',
        },
      }),
      this.courseRepository.count(),
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

  async createCourse(createCourseDto: CreateCourseDto): Promise<Course> {
    const user = await this.userRepository.findOne({ where: { userId: createCourseDto.userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${createCourseDto.userId} not found`);
    }
    if (user.role !== 'admin' && user.role !== 'employee') {
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

  async updateCourse(courseId: string, updateCourseDto: UpdateCourseDto): Promise<Course> {
    const user = await this.userRepository.findOne({ where: { userId: updateCourseDto.userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${updateCourseDto.userId} not found`);
    }
    if (user.role !== 'admin' && user.role !== 'employee') {
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

  // --- Lesson Logic ---
  async addLessonToCourse(courseId: string, createLessonDto: CreateLessonDto): Promise<Lesson> {
    const user = await this.userRepository.findOne({ where: { userId: createLessonDto.userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${createLessonDto.userId} not found`);
    }
    if (user.role !== 'admin' && user.role !== 'employee') {
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

  async updateLesson(courseId: string, lessonId: string, updateLessonDto: UpdateLessonDto): Promise<Lesson> {
    const user = await this.userRepository.findOne({ where: { userId: updateLessonDto.userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${updateLessonDto.userId} not found`);
    }
    if (user.role !== 'admin' && user.role !== 'employee') {
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
  async searchUnified(query: string): Promise<{ courses: Course[]; employees: Omit<User, 'password'>[] }> {
    const courses = await this.courseRepository.find({
      where: [
        { name: ILike(`%${query}%`) },
        { courseId: ILike(`%${query}%`) },
      ],
      relations: { category: true },
    });

    const employees = await this.userRepository.find({
      where: [
        { role: 'employee', name: ILike(`%${query}%`) },
        { role: 'employee', email: ILike(`%${query}%`) },
        { role: 'employee', userId: ILike(`%${query}%`) },
      ],
    });

    const employeesWithoutPassword = employees.map(({ password, ...user }) => user);

    return {
      courses,
      employees: employeesWithoutPassword,
    };
  }

  async searchCoursesOnly(query: string): Promise<Course[]> {
    return this.courseRepository.find({
      where: [
        { name: ILike(`%${query}%`) },
        { courseId: ILike(`%${query}%`) },
      ],
      relations: { category: true, lessons: true },
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
    }));
  }
}
