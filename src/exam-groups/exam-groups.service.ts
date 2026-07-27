import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { ExamGroup } from './entities/exam-group.entity';
import { ExamGroupQuestion } from './entities/exam-group-question.entity';
import { ExamGroupEnrollment } from './entities/exam-group-enrollment.entity';
import { ExamGroupSubmission } from './entities/exam-group-submission.entity';
import { ExamGroupAnswer } from './entities/exam-group-answer.entity';
import { User } from '../auth/entities/user.entity';
import { CreateExamGroupDto } from './dto/create-exam-group.dto';
import { UpdateExamGroupDto } from './dto/update-exam-group.dto';
import { AddQuestionsDto } from './dto/add-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { SubmitExamDto } from './dto/submit-exam.dto';

@Injectable()
export class ExamGroupsService {
  constructor(
    @InjectRepository(ExamGroup)
    private readonly examGroupRepo: Repository<ExamGroup>,
    @InjectRepository(ExamGroupQuestion)
    private readonly questionRepo: Repository<ExamGroupQuestion>,
    @InjectRepository(ExamGroupEnrollment)
    private readonly enrollmentRepo: Repository<ExamGroupEnrollment>,
    @InjectRepository(ExamGroupSubmission)
    private readonly submissionRepo: Repository<ExamGroupSubmission>,
    @InjectRepository(ExamGroupAnswer)
    private readonly answerRepo: Repository<ExamGroupAnswer>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  private async generateNextExamGroupId(): Promise<string> {
    const last = await this.examGroupRepo.findOne({
      where: {},
      withDeleted: true,
      order: { id: 'DESC' },
    });
    if (!last) {
      return 'EXG-0001';
    }
    const match = last.examGroupId.match(/EXG-(\d+)/);
    const nextNum = match ? parseInt(match[1]) + 1 : 1;
    return `EXG-${String(nextNum).padStart(4, '0')}`;
  }

  async createExamGroup(dto: CreateExamGroupDto): Promise<ExamGroup> {
    const examGroup = this.examGroupRepo.create({});

    const nextId = await this.generateNextExamGroupId();
    examGroup.examGroupId = nextId;
    examGroup.title = dto.title;
    examGroup.description = dto.description ?? null;
    examGroup.thumbnailUrl = dto.thumbnailUrl ?? null;
    examGroup.status = dto.status || 'draft';
    examGroup.totalStudents = 0;

    if (dto.startTime) {
      examGroup.startTime = new Date(dto.startTime);
    }
    if (dto.endTime) {
      examGroup.endTime = new Date(dto.endTime);
    }
    if (dto.timePerQuestion !== undefined) {
      examGroup.timePerQuestion = dto.timePerQuestion;
    }

    return this.examGroupRepo.save(examGroup);
  }

  async getExamGroupsPaginated(
    page: number = 1,
    limit: number = 10,
    q?: string,
    status?: string,
    role?: string,
    userId?: string,
  ): Promise<{ data: any[]; meta: any }> {
    const skippedItems = (page - 1) * limit;

    const where: any = {};
    if (role === 'user') {
      where.status = 'active';
      // User can browse all active exams to join them
    } else {
      if (status) {
        where.status = status;
      }
    }

    if (q) {
      where.title = ILike(`%${q}%`);
    }

    const [examGroups, total] = await Promise.all([
      this.examGroupRepo.find({
        where,
        skip: skippedItems,
        take: limit,
        relations: {
          questions: true,
          enrollments: { user: true },
        },
        select: {
          id: true,
          examGroupId: true,
          title: true,
          description: true,
          thumbnailUrl: true,
          status: true,
          startTime: true,
          endTime: true,
          timePerQuestion: true,
          totalStudents: true,
          createdAt: true,
          updatedAt: true,
          enrollments: {
            id: true,
            user: { userId: true },
          },
          questions: { id: true },
        },
        order: {
          startTime: 'DESC',
        },
      }),
      this.examGroupRepo.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: examGroups,
      meta: {
        totalItems: total,
        itemCount: examGroups.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }

  async getExamGroupById(
    id: number,
    requesterRole?: string,
    requesterUserId?: string,
  ): Promise<any> {
    const examGroup = await this.examGroupRepo.findOne({
      where: { id },
      relations: {
        questions: true,
        enrollments: { user: true },
      },
    });

    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }

    const isStudent = requesterRole === 'user';
    if (isStudent) {
      const enrolled = examGroup.enrollments?.some(
        (e) => e.user.userId === requesterUserId,
      );
      if (examGroup.status !== 'active' || !enrolled) {
        return {
          id: examGroup.id,
          examGroupId: examGroup.examGroupId,
          title: examGroup.title,
          description: examGroup.description,
          thumbnailUrl: examGroup.thumbnailUrl,
          status: examGroup.status,
          startTime: examGroup.startTime,
          endTime: examGroup.endTime,
          timePerQuestion: examGroup.timePerQuestion,
          totalStudents: examGroup.totalStudents,
          totalQuestions: examGroup.questions?.length || 0,
        };
      }
    }

    return examGroup;
  }

  async updateExamGroup(
    id: number,
    dto: UpdateExamGroupDto,
  ): Promise<ExamGroup> {
    const examGroup = await this.examGroupRepo.findOne({ where: { id } });
    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }

    if (dto.title !== undefined) examGroup.title = dto.title;
    if (dto.description !== undefined)
      examGroup.description = dto.description ?? null;
    if (dto.thumbnailUrl !== undefined)
      examGroup.thumbnailUrl = dto.thumbnailUrl ?? null;
    if (dto.status !== undefined) examGroup.status = dto.status;
    if (dto.startTime !== undefined) {
      examGroup.startTime = dto.startTime ? new Date(dto.startTime) : null;
    }
    if (dto.endTime !== undefined) {
      examGroup.endTime = dto.endTime ? new Date(dto.endTime) : null;
    }
    if (dto.timePerQuestion !== undefined)
      examGroup.timePerQuestion = dto.timePerQuestion;

    return this.examGroupRepo.save(examGroup);
  }

  async deleteExamGroup(
    id: number,
  ): Promise<{ success: boolean; message: string }> {
    const examGroup = await this.examGroupRepo.findOne({ where: { id } });
    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }
    await this.examGroupRepo.remove(examGroup);
    return { success: true, message: 'Exam group deleted successfully' };
  }

  async addQuestions(
    examGroupId: number,
    dto: AddQuestionsDto,
  ): Promise<ExamGroupQuestion[]> {
    const examGroup = await this.examGroupRepo.findOne({
      where: { id: examGroupId },
    });
    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }

    const questions = dto.questions.map((q) => {
      const question = this.questionRepo.create({
        questionText: q.questionText,
        options: q.options,
        correctAnswers: q.correctAnswers,
        marks: q.marks,
        examGroup,
      });
      return question;
    });

    return this.questionRepo.save(questions);
  }

  async removeQuestion(
    examGroupId: number,
    questionId: number,
  ): Promise<{ success: boolean; message: string }> {
    const question = await this.questionRepo.findOne({
      where: { id: questionId, examGroup: { id: examGroupId } },
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    await this.questionRepo.remove(question);
    return { success: true, message: 'Question removed successfully' };
  }

  async updateQuestion(
    examGroupId: number,
    questionId: number,
    dto: UpdateQuestionDto,
  ): Promise<ExamGroupQuestion> {
    const question = await this.questionRepo.findOne({
      where: { id: questionId, examGroup: { id: examGroupId } },
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    if (dto.questionText !== undefined) question.questionText = dto.questionText;
    if (dto.options !== undefined) question.options = dto.options;
    if (dto.correctAnswers !== undefined) question.correctAnswers = dto.correctAnswers;
    if (dto.marks !== undefined) question.marks = dto.marks;

    return this.questionRepo.save(question);
  }

  async enrollUser(
    examGroupId: number,
    targetUserId: string,
  ): Promise<ExamGroupEnrollment> {
    const examGroup = await this.examGroupRepo.findOne({
      where: { id: examGroupId },
    });
    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }

    const user = await this.userRepo.findOne({
      where: { userId: targetUserId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.enrollmentRepo.findOne({
      where: { user: { id: user.id }, examGroup: { id: examGroupId } },
    });
    if (existing) {
      throw new ConflictException(
        'User is already enrolled in this exam group',
      );
    }

    const enrollment = this.enrollmentRepo.create({
      user,
      examGroup,
    });

    const saved = await this.enrollmentRepo.save(enrollment);
    examGroup.totalStudents = await this.enrollmentRepo.count({
      where: { examGroup: { id: examGroupId } },
    });
    await this.examGroupRepo.save(examGroup);

    return saved;
  }

  async removeEnrollment(
    examGroupId: number,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const enrollment = await this.enrollmentRepo.findOne({
      where: { user: { id: user.id }, examGroup: { id: examGroupId } },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }

    await this.enrollmentRepo.remove(enrollment);

    const examGroup = await this.examGroupRepo.findOne({
      where: { id: examGroupId },
    });
    if (examGroup) {
      examGroup.totalStudents = await this.enrollmentRepo.count({
        where: { examGroup: { id: examGroupId } },
      });
      await this.examGroupRepo.save(examGroup);
    }

    return { success: true, message: 'Enrollment removed successfully' };
  }

  async joinExam(
    examGroupId: number,
    userId: string,
  ): Promise<ExamGroupEnrollment> {
    const examGroup = await this.examGroupRepo.findOne({
      where: { id: examGroupId },
    });
    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }
    if (examGroup.status !== 'active') {
      throw new BadRequestException('This exam is not active');
    }
    const now = new Date();
    if (examGroup.startTime && now < examGroup.startTime) {
      throw new BadRequestException('Exam has not started yet');
    }
    if (examGroup.endTime && now > examGroup.endTime) {
      throw new BadRequestException('Exam has ended');
    }

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.enrollmentRepo.findOne({
      where: { user: { id: user.id }, examGroup: { id: examGroupId } },
    });
    if (existing) {
      throw new ConflictException('You are already enrolled in this exam');
    }

    const enrollment = this.enrollmentRepo.create({
      user,
      examGroup,
    });

    const saved = await this.enrollmentRepo.save(enrollment);
    examGroup.totalStudents = await this.enrollmentRepo.count({
      where: { examGroup: { id: examGroupId } },
    });
    await this.examGroupRepo.save(examGroup);

    return saved;
  }

  async submitExam(
    examGroupId: number,
    userId: string,
    dto: SubmitExamDto,
  ): Promise<ExamGroupSubmission> {
    const examGroup = await this.examGroupRepo.findOne({
      where: { id: examGroupId },
      relations: { questions: true },
    });
    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingSubmission = await this.submissionRepo.findOne({
      where: { user: { id: user.id }, examGroup: { id: examGroupId } },
    });
    if (existingSubmission) {
      throw new ConflictException('You have already submitted this exam');
    }

    const now = new Date();
    if (examGroup.endTime && now > examGroup.endTime) {
      throw new BadRequestException('Exam has ended, submission not accepted');
    }

    const enrollment = await this.enrollmentRepo.findOne({
      where: { user: { id: user.id }, examGroup: { id: examGroupId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You are not enrolled in this exam');
    }

    let marksObtained = 0;
    const answers: Partial<ExamGroupAnswer>[] = dto.answers
      .map((answerDto) => {
        const question = examGroup.questions.find(
          (q) => q.id === answerDto.questionId,
        );
        if (!question) return null;

        const providedArr = answerDto.providedAnswer || [];
        const correctArr = question.correctAnswers || [];
        const isCorrect =
          providedArr.length > 0 &&
          correctArr.every((c) => providedArr.includes(c));
        const awarded = isCorrect ? question.marks : 0;
        marksObtained += awarded;

        return {
          providedAnswer: providedArr,
          marksAwarded: awarded,
          question: { id: question.id } as ExamGroupQuestion,
        };
      })
      .filter((a) => a !== null);

    const submission = this.submissionRepo.create({
      user,
      examGroup,
      marksObtained,
      status: 'Evaluated',
      submittedAt: now,
    });

    const savedSubmission = await this.submissionRepo.save(submission);

    if (answers.length > 0) {
      const answerEntities = this.answerRepo.create(
        answers.map((a) => ({
          ...a,
          submission: { id: savedSubmission.id } as ExamGroupSubmission,
        })),
      );
      await this.answerRepo.save(answerEntities);
    }

    return savedSubmission;
  }

  async getMySubmissions(
    examGroupId: number,
    userId: string,
  ): Promise<ExamGroupSubmission[]> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.submissionRepo.find({
      where: { examGroup: { id: examGroupId }, user: { id: user.id } },
      relations: { answers: { question: true } },
      order: { createdAt: 'DESC' },
    });
  }

  async getAllSubmissions(examGroupId: number): Promise<ExamGroupSubmission[]> {
    return this.submissionRepo.find({
      where: { examGroup: { id: examGroupId } },
      relations: { user: true, answers: { question: true } },
      order: { createdAt: 'DESC' },
    });
  }

  async getRemainingCount(examGroupId: number): Promise<{
    remaining: number;
    totalEnrolled: number;
    totalSubmitted: number;
  }> {
    const totalEnrolled = await this.enrollmentRepo.count({
      where: { examGroup: { id: examGroupId } },
    });
    const submittedUsers = await this.submissionRepo
      .createQueryBuilder('submission')
      .select('DISTINCT submission.userId')
      .where('submission.examGroupId = :examGroupId', { examGroupId })
      .getRawMany();

    const totalSubmitted = submittedUsers.length;
    const remaining = Math.max(0, totalEnrolled - totalSubmitted);

    return { remaining, totalEnrolled, totalSubmitted };
  }
}
