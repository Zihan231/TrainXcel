import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, In, MoreThanOrEqual } from 'typeorm';
import { Test } from './entities/test.entity';
import { Question } from './entities/question.entity';
import { TestSubmission } from './entities/test-submission.entity';
import { SubmissionAnswer } from './entities/submission-answer.entity';
import { Course } from './entities/course.entity';
import { Lesson } from './entities/lesson.entity';
import { Enrollment } from './entities/enrollment.entity';
import { User } from '../auth/entities/user.entity';
import { Notification } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';
import { CreateTestDto } from './dto/create-test.dto';
import { SubmitTestDto } from './dto/submit-test.dto';
import { EvaluateCqDto } from './dto/evaluate-cq.dto';
import { MediaProcessorService } from './media-processor.service';
import { SpeechService } from './speech.service';

@Injectable()
export class TestsService {
  constructor(
    @InjectRepository(Test) private testRepo: Repository<Test>,
    @InjectRepository(Question) private questionRepo: Repository<Question>,
    @InjectRepository(TestSubmission) private submissionRepo: Repository<TestSubmission>,
    @InjectRepository(SubmissionAnswer) private answerRepo: Repository<SubmissionAnswer>,
    @InjectRepository(Course) private courseRepo: Repository<Course>,
    @InjectRepository(Lesson) private lessonRepo: Repository<Lesson>,
    @InjectRepository(Enrollment) private enrollmentRepo: Repository<Enrollment>,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Notification) private notificationRepo: Repository<Notification>,
    private readonly notificationsGateway: NotificationsGateway,
    private mediaProcessorService: MediaProcessorService,
    private speechService: SpeechService,
  ) {}

  async createTest(createDto: CreateTestDto, userId: string, role: string) {
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException('Only admin or employee can create tests');
    }

    const test = new Test();
    test.title = createDto.title;
    test.description = createDto.description || '';
    test.testType = createDto.testType;
    if (createDto.startTime) test.startTime = new Date(createDto.startTime);
    if (createDto.endTime) test.endTime = new Date(createDto.endTime);

    const now = new Date();
    if (createDto.testType === 'Standalone') {
      if (test.startTime && now < test.startTime) {
        test.status = 'scheduled';
      } else if (test.endTime && now > test.endTime) {
        test.status = 'completed';
      } else {
        test.status = 'active';
      }
    } else {
      test.status = 'published';
    }

    if (createDto.courseId) {
      const course = await this.courseRepo.findOne({ where: { id: createDto.courseId } });
      if (!course) throw new NotFoundException('Course not found');
      test.course = course;
    }

    if (createDto.lessonId) {
      const lesson = await this.lessonRepo.findOne({ where: { id: createDto.lessonId }, relations: { course: true } });
      if (!lesson) throw new NotFoundException('Lesson not found');
      test.lesson = lesson;
      if (!test.course && lesson.course) {
        test.course = lesson.course;
      }
    }

    test.questions = createDto.questions.map(q => {
      const question = new Question();
      question.questionText = q.questionText;
      question.type = q.type;
      question.marks = q.marks;
      if (q.type === 'MCQ') {
        question.options = q.options || [];
        question.correctAnswers = q.correctAnswers || [];
      }
      return question;
    });

    const savedTest = await this.testRepo.save(test);

    // Trigger Notification for Enrolled Users
    if (test.course) {
      const course = await this.courseRepo.findOne({
        where: { id: test.course.id },
        relations: { enrollments: { user: true } }
      });
      if (course && course.enrollments) {
        for (const enrollment of course.enrollments) {
          const notification = new Notification();
          notification.message = `A new test "${test.title}" is available in course ${course.name}.`;
          notification.user = enrollment.user;
          notification.actionLink = `/courses/${course.courseId}`;
          await this.notificationRepo.save(notification);

          this.notificationsGateway.sendNotificationToUser(enrollment.user.userId, {
            message: notification.message,
            actionLink: notification.actionLink,
            createdAt: notification.createdAt,
          });
        }
      }
    }

    return savedTest;
  }

  async getTestsForLesson(lessonId: number) {
    return this.testRepo.find({
      where: { lesson: { id: lessonId } },
      relations: { questions: true },
    });
  }

  async getTestsForCourse(courseIdOrCode: number | string) {
    const courseIdStr = String(courseIdOrCode).trim();
    const isNumeric = /^[0-9]+$/.test(courseIdStr) && String(Number(courseIdStr)) === courseIdStr;

    const course = isNumeric
      ? await this.courseRepo.findOne({ where: { id: Number(courseIdStr) } })
      : await this.courseRepo.findOne({ where: { courseId: courseIdStr } });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return this.testRepo.find({
      where: { course: { id: course.id }, testType: 'Course' },
      relations: { questions: true },
    });
  }

  async getMySubmission(testId: number, userId: string) {
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.submissionRepo.findOne({
      where: { test: { id: testId }, user: { id: user.id }, isDraft: false },
      relations: { answers: { question: true } },
      order: { createdAt: 'DESC' }
    });
  }
  
  async getStandaloneExamsForCourse(courseIdOrCode: number | string, role: string = 'user') {
    const courseIdStr = String(courseIdOrCode).trim();
    const isNumeric = /^[0-9]+$/.test(courseIdStr) && String(Number(courseIdStr)) === courseIdStr;

    const course = isNumeric
      ? await this.courseRepo.findOne({ where: { id: Number(courseIdStr) } })
      : await this.courseRepo.findOne({ where: { courseId: courseIdStr } });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const whereClause: any = {
      course: { id: course.id },
      testType: In(['Standalone', 'standalone']),
    };

    if (role !== 'admin' && role !== 'employee') {
      // Users should be able to see standalone timed exams as soon as they're added,
      // even if the startTime is in the future (status = 'scheduled').
      whereClause.status = In(['published', 'scheduled', 'active', 'completed']);
    }

    return this.testRepo.find({
      where: whereClause,
      relations: { questions: true },
      order: { createdAt: 'DESC' },
    });
  }

  async submitTest(submitDto: SubmitTestDto, userId: string) {
    const test = await this.testRepo.findOne({ where: { id: submitDto.testId }, relations: { questions: true, course: true, lesson: true } });
    if (!test) throw new NotFoundException('Test not found');

    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');
    const userInternalId = user.id;

    if (test.testType === 'Standalone') {
      const now = new Date();
      if (test.startTime && now < test.startTime) throw new BadRequestException('Exam has not started yet');
      const gracePeriodMs = 60 * 1000; // 1 minute grace period
      if (test.endTime && now.getTime() > test.endTime.getTime() + gracePeriodMs) throw new BadRequestException('Exam has ended');
      
      // Ensure enrolled
      if (test.course) {
        const enrollment = await this.enrollmentRepo.findOne({ where: { course: { id: test.course.id }, user: { id: userInternalId } } });
        if (!enrollment) throw new ForbiddenException('You must be enrolled in this course to take this exam');
      }
    }

    // Check previous submissions
    const previousSubmission = await this.submissionRepo.findOne({
      where: { test: { id: test.id }, user: { id: userInternalId }, isDraft: false },
      order: { createdAt: 'ASC' }
    });

    // If it's not a draft and user is submitting a new one for retake
    let submission = new TestSubmission();
    
    // Find if there is an existing draft
    const existingDraft = await this.submissionRepo.findOne({
      where: { test: { id: test.id }, user: { id: userInternalId }, isDraft: true },
      relations: { answers: true }
    });

    if (existingDraft) {
      submission = existingDraft;
    } else {
      submission.test = test;
      submission.user = { id: userInternalId } as any;
    }

    submission.isDraft = submitDto.isDraft || false;
    if (!submission.isDraft) {
      submission.submittedAt = new Date();
    }

    let totalMarks = 0;
    let needsManualEvaluation = false;

    // Remove old answers for draft update
    if (existingDraft && existingDraft.answers) {
      await this.answerRepo.remove(existingDraft.answers);
    }
    
    submission.answers = [];

    for (const ans of submitDto.answers) {
      const question = test.questions.find(q => q.id === ans.questionId);
      if (!question) continue;

      const subAnswer = new SubmissionAnswer();
      subAnswer.question = question;
      subAnswer.providedAnswer = ans.providedAnswer;

      if (!submission.isDraft) {
        if (question.type === 'MCQ') {
          // Auto evaluation
          const provided = Array.isArray(ans.providedAnswer) ? ans.providedAnswer : [ans.providedAnswer];
          const correct = question.correctAnswers || [];
          
          // Check if exactly same elements
          const isCorrect = provided.length === correct.length && provided.every(val => correct.includes(val));
          if (isCorrect) {
            subAnswer.marksAwarded = question.marks;
            totalMarks += question.marks;
          } else {
            subAnswer.marksAwarded = 0;
          }
        } else if (question.type === 'CQ' || question.type === 'Video') {
          needsManualEvaluation = true;
          subAnswer.marksAwarded = 0; // pending
        }
      }

      submission.answers.push(subAnswer);
    }

    submission.marksObtained = totalMarks;
    submission.status = needsManualEvaluation && !submission.isDraft ? 'Pending Evaluation' : 'Evaluated';

    // If user has already submitted before, do NOT save this second attempt to DB (practice mode)
    if (previousSubmission) {
      return submission;
    }

    // Save
    const saved = await this.submissionRepo.save(submission);
 
    // Auto-complete lesson if it's a lesson-level test and not a draft
    if (test.testType === 'Lesson' && !submission.isDraft && test.lesson && test.course) {
      const enrollment = await this.enrollmentRepo.findOne({
        where: { user: { id: userInternalId }, course: { id: test.course.id } },
        relations: { completedLessons: true, course: { lessons: true } }
      });
      if (enrollment) {
        const alreadyCompleted = enrollment.completedLessons.some(cl => cl.id === test.lesson.id);
        if (!alreadyCompleted) {
          enrollment.completedLessons.push(test.lesson);
          const totalLessons = enrollment.course.lessons.length;
          const completedCount = enrollment.completedLessons.length;
          enrollment.progress = Math.round((completedCount / totalLessons) * 100 * 100) / 100;
          await this.enrollmentRepo.save(enrollment);
        }
      }
    }
    if (!submission.isDraft && needsManualEvaluation) {
      const videoAnswer = submitDto.answers.find(ans => {
        const q = test.questions.find(quest => quest.id === ans.questionId);
        return q && q.type === 'Video';
      });

      if (videoAnswer && videoAnswer.providedAnswer) {
        let filename = videoAnswer.providedAnswer;
        if (filename.includes('/')) {
          filename = filename.split('/').pop(); 
        }

        this.mediaProcessorService.processVideoAssets(
          filename, 
          test.id,
          test.lesson?.id
        ).then(async (assets) => { // 1. Add 'async' and capture the 'assets' response
          
          console.log(`[Media Processor] Assets successfully extracted for test-${test.id}`);
          
          try {
            // assets.audioPath is the direct path to the new MP3 file we just made
            const transcript = await this.speechService.transcribeAudio(assets.audioPath);
            
            console.log(`[Speech API] Final Transcript:\n`, transcript);
            
            // (Later, we will save this transcript to the database here)
            
          } catch (speechErr) {
            console.error(`[Speech API] Failed to transcribe audio:`, speechErr);
          }

        }).catch((err) => {
          console.error(`[Media Processor] Failed to extract media for test-${test.id}:`, err);
        });
      }
    }
 
    // Only update recorded marks if it's the first submission or if it's replacing a draft
    // The user said: "for mcq only learners can retake but it will not update his marks what he achived in first attempt."
    // So if previousSubmission exists, we do NOT return the new marks for leaderboard, but we save it.
    
    return saved;
  }

  async getPendingEvaluations(userId: string, role: string) {
    if (role !== 'admin' && role !== 'employee') throw new ForbiddenException();
    return this.submissionRepo.find({
      where: { status: 'Pending Evaluation', isDraft: false },
      relations: { test: { lesson: { course: true }, course: true }, user: true, answers: { question: true } },
    });
  }

  async evaluateCq(evalDto: EvaluateCqDto, userId: string, role: string) {
    if (role !== 'admin' && role !== 'employee') throw new ForbiddenException();

    const submission = await this.submissionRepo.findOne({
      where: { id: evalDto.testSubmissionId },
      relations: { answers: { question: true } }
    });

    if (!submission) throw new NotFoundException('Submission not found');

    let newMarksAdded = 0;

    for (const ev of evalDto.evaluations) {
      const ans = submission.answers.find(a => a.id === ev.submissionAnswerId);
      if (ans && (ans.question.type === 'CQ' || ans.question.type === 'Video')) {
        ans.marksAwarded = ev.marksAwarded;
        ans.evaluatorComment = ev.evaluatorComment || '';
        newMarksAdded += ev.marksAwarded;
      }
    }

    submission.marksObtained += newMarksAdded;
    submission.status = 'Evaluated';
    
    // Save answers
    await this.answerRepo.save(submission.answers);
    
    return this.submissionRepo.save(submission);
  }

  async getLeaderboard(lessonId: number) {
    // Find all evaluated submissions for tests linked to this lesson
    const tests = await this.testRepo.find({ where: { lesson: { id: lessonId } } });
    if (!tests.length) return [];

    const testIds = tests.map(t => t.id);
    
    const submissions = await this.submissionRepo.createQueryBuilder('sub')
      .leftJoinAndSelect('sub.user', 'user')
      .where('sub.testId IN (:...testIds)', { testIds })
      .andWhere('sub.isDraft = :isDraft', { isDraft: false })
      .andWhere('sub.status = :status', { status: 'Evaluated' })
      .orderBy('sub.submittedAt', 'ASC')
      .getMany();

    // Group by user, taking only their FIRST attempt for ranking
    const userFirstAttempts = new Map<number, any>();
    for (const sub of submissions) {
      if (!userFirstAttempts.has(sub.user.id)) {
        userFirstAttempts.set(sub.user.id, sub);
      }
    }

    const leaderboard = Array.from(userFirstAttempts.values()).map((sub) => ({
      userId: sub.user.userId,
      name: sub.user.name,
      marksObtained: sub.marksObtained,
      submittedAt: sub.submittedAt,
    }));

    // Sort leaderboard by marksObtained DESC, then by submittedAt ASC
    leaderboard.sort((a, b) => {
      if (b.marksObtained !== a.marksObtained) {
        return b.marksObtained - a.marksObtained;
      }
      return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
    });

    return leaderboard.slice(0, 5);
  }

  async updateQuestion(
    questionId: number,
    data: { questionText?: string; options?: string[]; correctAnswers?: string[]; marks?: number },
    role: string,
  ) {
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException('Only admin or employee can edit questions');
    }
    const question = await this.questionRepo.findOne({ where: { id: questionId } });
    if (!question) throw new NotFoundException('Question not found');

    if (data.questionText !== undefined) question.questionText = data.questionText;
    if (data.options !== undefined) question.options = data.options;
    if (data.correctAnswers !== undefined) question.correctAnswers = data.correctAnswers;
    if (data.marks !== undefined) question.marks = data.marks;

    return this.questionRepo.save(question);
  }

  async getLessonSubmissions(lessonId: number) {
    const tests = await this.testRepo.find({ where: { lesson: { id: lessonId } } });
    if (!tests.length) return [];

    const testIds = tests.map((t) => t.id);

    return this.submissionRepo.find({
      where: { test: { id: In(testIds) }, isDraft: false },
      relations: { user: true, test: true },
      order: { submittedAt: 'DESC' },
    });
  }
}
