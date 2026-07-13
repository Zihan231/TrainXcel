import { Controller, Get, Post, Body, Param, UseGuards, Req, Put } from '@nestjs/common';
import { TestsService } from './tests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTestDto } from './dto/create-test.dto';
import { SubmitTestDto } from './dto/submit-test.dto';
import { EvaluateCqDto } from './dto/evaluate-cq.dto';

@Controller('tests')
@UseGuards(JwtAuthGuard)
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Post()
  async createTest(@Body() createDto: CreateTestDto, @Req() req: any) {
    const { userId, role } = req.user;
    return this.testsService.createTest(createDto, userId, role);
  }

  @Get('lesson/:lessonId')
  async getTestsForLesson(@Param('lessonId') lessonId: string) {
    return this.testsService.getTestsForLesson(+lessonId);
  }

  @Get('course/:courseId')
  async getTestsForCourse(@Param('courseId') courseId: string) {
    return this.testsService.getTestsForCourse(+courseId);
  }

  @Get(':testId/my-submission')
  @UseGuards(JwtAuthGuard)
  async getMySubmission(@Param('testId') testId: string, @Req() req: any) {
    return this.testsService.getMySubmission(+testId, req.user.userId);
  }

  @Get('standalone/:courseId')
  async getStandaloneExamsForCourse(@Param('courseId') courseId: string) {
    return this.testsService.getStandaloneExamsForCourse(+courseId);
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
    @Body() body: { questionText?: string; options?: string[]; correctAnswers?: string[]; marks?: number },
    @Req() req: any,
  ) {
    const { role } = req.user;
    return this.testsService.updateQuestion(+questionId, body, role);
  }
}
