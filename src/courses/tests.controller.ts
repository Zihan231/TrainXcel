import { Controller, Get, Post, Body, Param, UseGuards, Req, Put, ForbiddenException, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { TestsService } from './tests.service';
import { ExamSchedulerService } from './exam-scheduler.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTestDto } from './dto/create-test.dto';
import { SubmitTestDto } from './dto/submit-test.dto';
import { EvaluateCqDto } from './dto/evaluate-cq.dto';
import { UpdateTestDto } from './dto/update-test.dto';

@Controller('tests')
@UseGuards(JwtAuthGuard)
export class TestsController {
  constructor(
    private readonly testsService: TestsService,
    private readonly examSchedulerService: ExamSchedulerService,
  ) {}

  @Post()
  async createTest(@Body() createDto: CreateTestDto, @Req() req: any) {
    const { userId, role } = req.user;
    return this.testsService.createTest(createDto, userId, role);
  }

  @Post('upload-test-video')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/test-videos',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (file.mimetype.match(/\/(mp4|mpeg|quicktime|webm|ogg)$/) || file.originalname.match(/\.(mp4|mov|avi|webm|ogg)$/i)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only video files are allowed.'), false);
        }
      },
    }),
  )
  async uploadTestVideo(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('Video file is required');
    }
    return {
      url: `/uploads/test-videos/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
    };
  }

  @Get('lesson/:lessonId')
  async getTestsForLesson(@Param('lessonId') lessonId: string) {
    return this.testsService.getTestsForLesson(+lessonId);
  }

  @Get('course/:courseId')
  async getTestsForCourse(@Param('courseId') courseId: string) {
    return this.testsService.getTestsForCourse(courseId);
  }

  @Get(':testId/my-submission')
  @UseGuards(JwtAuthGuard)
  async getMySubmission(@Param('testId') testId: string, @Req() req: any) {
    return this.testsService.getMySubmission(+testId, req.user.userId);
  }

  @Get('standalone/:courseId')
  async getStandaloneExamsForCourse(@Param('courseId') courseId: string, @Req() req: any) {
    const role = req.user?.role || 'user';
    return this.testsService.getStandaloneExamsForCourse(courseId, role);
  }

  @Post('submit')
  async submitTest(@Body() submitDto: SubmitTestDto, @Req() req: any) {
    return this.testsService.submitTest(submitDto, req.user.userId);
  }

  @Get('evaluations/pending')
  async getPendingEvaluations(@Req() req: any) {
    const { userId, role } = req.user;
    return this.testsService.getPendingEvaluations(userId, role);
  }

  @Put('evaluations')
  async evaluateCq(@Body() evalDto: EvaluateCqDto, @Req() req: any) {
    const { userId, role } = req.user;
    return this.testsService.evaluateCq(evalDto, userId, role);
  }

  @Get('leaderboard/:lessonId')
  async getLeaderboard(@Param('lessonId') lessonId: string) {
    return this.testsService.getLeaderboard(+lessonId);
  }

  @Put('questions/:questionId')
  async updateQuestion(
    @Param('questionId') questionId: string,
    @Body() body: { questionText?: string; options?: string[]; correctAnswers?: string[]; marks?: number; evaluationType?: string; referenceScript?: string },
    @Req() req: any,
  ) {
    const { role } = req.user;
    return this.testsService.updateQuestion(+questionId, body, role);
  }

  @Get('lesson/:lessonId/submissions')
  async getLessonSubmissions(@Param('lessonId') lessonId: string, @Req() req: any) {
    const { role } = req.user;
    if (role === 'user') {
      throw new ForbiddenException('Only admin and employee users can view all student marks');
    }
    return this.testsService.getLessonSubmissions(+lessonId);
  }

 

  @Put(':testId')
  async updateTest(
    @Param('testId') testId: string,
    @Body() body: UpdateTestDto,
    @Req() req: any,
  ) {
    const { role } = req.user;
    return this.testsService.updateTest(+testId, body, role);
  }

  @Post('standalone/:examId/finalize')
  async finalizeExam(@Param('examId') examId: string, @Req() req: any) {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException('Only admin and employee can finalize exams');
    }
    return this.examSchedulerService.finalizeExamManually(+examId);
  }
}
