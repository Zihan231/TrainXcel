import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, In, MoreThanOrEqual } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { OfficeParser } from 'officeparser';
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
import { UpdateTestDto } from './dto/update-test.dto';
import { MediaProcessorService } from './media-processor.service';
// import { SpeechService } from './speech.service';
import { CloudStorageService } from './cloud-storage.service';
import { GeminiAnalysisService } from './gemini-analysis.service';

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
    // private speechService: SpeechService,
    private readonly cloudStorageService: CloudStorageService,
    private readonly geminiAnalysisService: GeminiAnalysisService,
  ) {}

  async createTest(createDto: CreateTestDto, userId: string, role: string) {
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException('Only admin or employee can create tests');
    }

    const test = new Test();
    test.title = createDto.title;
    test.description = createDto.description || '';
    test.testType = createDto.testType;
    test.referenceScript = createDto.referenceScript || undefined;
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
      if (q.postureMarks !== undefined) question.postureMarks = q.postureMarks;
      if (q.voiceMarks !== undefined) question.voiceMarks = q.voiceMarks;
      if (q.accuracyMarks !== undefined) question.accuracyMarks = q.accuracyMarks;
      question.evaluationType = q.evaluationType || 'AI';
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
          const savedNotif = await this.notificationRepo.save(notification);

          this.notificationsGateway.sendNotificationToUser(enrollment.user.userId, {
            id: savedNotif.id,
            message: savedNotif.message,
            actionLink: savedNotif.actionLink,
            createdAt: savedNotif.createdAt,
            isRead: false,
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
      order: { id: 'DESC' },
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
      order: { id: 'DESC' },
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

  async getSubmissionById(submissionId: number) {
    return this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: { user: true, test: true, answers: { question: true } }
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

    if (!submission.isDraft) {
      for (const question of test.questions) {
        if (question.type === 'Video') {
          const provided = submitDto.answers.find(ans => ans.questionId === question.id);
          if (!provided || !provided.providedAnswer || String(provided.providedAnswer).trim() === '' || provided.providedAnswer === 'Uploading...') {
            throw new BadRequestException(`A video response is required for question: "${question.questionText}"`);
          }
        }
      }
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
          subAnswer.evaluatedBy = 'System';
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

    // Save initial submission state
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

    // --- ASYNCHRONOUS AI EVALUATION WORKFLOW ---
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

        // Grab the actual question object to get marks and the script URI
        const videoQuestion = test.questions.find(quest => quest.id === videoAnswer.questionId);
        if (!videoQuestion) return;

        if (videoQuestion.evaluationType === 'Manual') {
          console.log(`[TestsService] Video question id=${videoQuestion.id} is configured for Manual evaluation. Skipping AI Gemini flow.`);
          return;
        }

        this.mediaProcessorService.processVideoAssets(
          filename, 
          saved.id
        ).then(async (assets) => { 
          
          console.log(`[Media Processor] Assets successfully extracted for submission-${saved.id}`);
          
          try {
            /* 
            // --- KEPT FOR REFERENCE: LEGACY SPEECH-TO-TEXT ---
            // 1. Transcribe the Audio
            const transcript = await this.speechService.transcribeAudio(assets.audioPath);
            console.log(`[Speech API] Final Transcript:\n`, transcript);
            */

            // 1. Upload extracted assets to Google Cloud Storage (Parallel)
            console.log(`[Cloud Storage] Uploading assets to GCS for submission-${saved.id}...`);
            const audioDestination = `evaluations/submission_${saved.id}/audio/extracted_audio.mp3`;
            
            const [audioGcsUri, snapshotGcsUris] = await Promise.all([
              this.cloudStorageService.uploadFile(assets.audioPath, audioDestination),
              this.cloudStorageService.uploadSnapshots(assets.snapshotDir, saved.id)
            ]);
            
            console.log(`[Cloud Storage] Upload complete! Audio: ${audioGcsUri}, Snapshots: ${snapshotGcsUris.length}`);

            // 2. Setup Script details
            let scriptGcsUri = ''; 
            let scriptMimeType = ''; 
            let scriptText: string | undefined;

            if (test.referenceScript) {
              const cleanLink = test.referenceScript.replace(/^[/\\]+/, '');
              const localPath = path.resolve('.', cleanLink);
              if (fs.existsSync(localPath)) {
                const ext = path.extname(localPath).toLowerCase();
                let shouldUpload = true;
                
                if (ext === '.pdf') {
                  scriptMimeType = 'application/pdf';
                } else if (ext === '.docx') {
                  scriptMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                  try {
                    const ast = await OfficeParser.parseOffice(localPath);
                    scriptText = ast.toText();
                    shouldUpload = false;
                  } catch (e) {
                    console.error('[officeParser] Failed to parse docx:', e);
                  }
                } else if (ext === '.pptx' || ext === '.ppt') {
                  scriptMimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
                  try {
                    const ast = await OfficeParser.parseOffice(localPath);
                    scriptText = ast.toText();
                    shouldUpload = false;
                  } catch (e) {
                    console.error('[officeParser] Failed to parse pptx:', e);
                  }
                }
                
                if (shouldUpload) {
                  const scriptDestination = `evaluations/${test.id}/script/${path.basename(localPath)}`;
                  try {
                    console.log(`[Cloud Storage] Uploading reference script: ${localPath}`);
                    scriptGcsUri = await this.cloudStorageService.uploadFile(localPath, scriptDestination);
                  } catch (scriptUploadError) {
                    console.error(`[Cloud Storage] Failed to upload reference script, using fallback.`, scriptUploadError);
                  }
                } else {
                  console.log(`[Cloud Storage] Extracted text from script locally, skipping GCS upload.`);
                }
              } else {
                console.log(`[Cloud Storage] Reference script path not found on disk, treating as plain text instruction.`);
                scriptText = test.referenceScript;
              }
            } else {
              console.log(`[Cloud Storage] No reference script provided, setting fallback prompt text.`);
              scriptText = "No reference script was provided for this test. Evaluate the candidate's general communication structure and flow.";
            }

            // 3. Trigger Gemini for Video Evaluation
            console.log(`[Gemini AI] Starting evaluation...`);
            const pMarks = videoQuestion.postureMarks ?? (videoQuestion.marks / 3);
            const vMarks = videoQuestion.voiceMarks ?? (videoQuestion.marks / 3);
            const aMarks = videoQuestion.accuracyMarks ?? (videoQuestion.marks / 3);

            const evaluationResult = await this.geminiAnalysisService.evaluateCandidate(
               audioGcsUri, 
               snapshotGcsUris, 
               scriptGcsUri,
               scriptMimeType,
               pMarks,
               vMarks,
               aMarks,
               scriptText
            );
            
            console.log(`[Gemini AI] Evaluation complete:`, evaluationResult);
            
            // 4. Update the database with the AI score
            const savedSubAnswer = await this.answerRepo.findOne({
              where: {
                submission: { id: saved.id },
                question: { id: videoQuestion.id }
              }
            });

              if (savedSubAnswer) {
              const commentString = JSON.stringify(evaluationResult);
              console.log(`[Database] Updating Answer ID ${savedSubAnswer.id} with marks: ${evaluationResult.overallScore}, comment length: ${commentString.length}`);
              await this.answerRepo.update(savedSubAnswer.id, {
                marksAwarded: evaluationResult.overallScore,
                evaluatorComment: commentString,
                evaluatedBy: 'AI'
              });
            } else {
              console.error(`[Database] Could not find SubmissionAnswer for submission: ${saved.id}, question: ${videoQuestion.id}`);
            }

            // Update the overall submission total marks and status using update to prevent TypeORM cascade overwriting
            const newMarksObtained = saved.marksObtained + evaluationResult.overallScore;
            await this.submissionRepo.update(saved.id, {
              marksObtained: newMarksObtained,
              status: 'Evaluated'
            });

            console.log(`[Database] Submission ${saved.id} successfully updated with AI score: ${evaluationResult.overallScore}`);

            // Send notification to the student
            try {
              const fullSubmission = await this.submissionRepo.findOne({
                where: { id: saved.id },
                relations: { user: true, test: true }
              });
              if (fullSubmission && fullSubmission.user) {
                const notification = new Notification();
                notification.message = `Your test "${fullSubmission.test.title}" has been evaluated by AI.`;
                notification.user = fullSubmission.user;
                notification.actionLink = `/dashboard?tab=my-learning`;
                const savedNotif = await this.notificationRepo.save(notification);

                this.notificationsGateway.sendNotificationToUser(fullSubmission.user.userId, {
                  id: savedNotif.id,
                  message: savedNotif.message,
                  actionLink: savedNotif.actionLink,
                  createdAt: savedNotif.createdAt,
                  isRead: false
                });
              }
            } catch (notifErr) {
              console.error(`[Notification] Failed to notify user for AI evaluation:`, notifErr);
            }
            
            // Delete the temporary local files inside VdoEva
            try {
              const outputDir = path.dirname(assets.snapshotDir);
              if (fs.existsSync(outputDir)) {
                fs.rmSync(outputDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 5000 });
                console.log(`[Media Processor] Cleaned up temporary extraction folder: ${outputDir}`);
              }
            } catch (err) {
              console.error(`[Media Processor] Failed to clean up temporary extraction folder:`, err);
            }

          } catch (workflowError) {
            console.error(`[Evaluation Workflow] Failed during AI or Cloud processing:`, workflowError);
            
            // Cleanup on error too!
            try {
              const outputDir = path.dirname(assets.snapshotDir);
              if (fs.existsSync(outputDir)) {
                fs.rmSync(outputDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 5000 });
                console.log(`[Media Processor] Cleaned up temporary extraction folder after error: ${outputDir}`);
              }
            } catch (err) {
              console.error(`[Media Processor] Failed to clean up temporary extraction folder:`, err);
            }
          }

        }).catch((err) => {
          console.error(`[Media Processor] Failed to extract media for test-${test.id}:`, err);
        });
      }
    }
 
    return saved;
  }

  async getPendingEvaluations(userId: string, role: string, lessonId?: number, testId?: number) {
    if (role !== 'admin' && role !== 'employee') throw new ForbiddenException();

    const whereCondition: any = { isDraft: false };
    if (testId) {
      whereCondition.test = { id: testId };
    } else if (lessonId) {
      whereCondition.test = { lesson: { id: lessonId } };
    } else {
      whereCondition.status = 'Pending Evaluation';
    }

    return this.submissionRepo.find({
      where: whereCondition,
      relations: { test: { lesson: { course: true }, course: true }, user: true, answers: { question: true } },
      order: { createdAt: 'DESC' },
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
        if (ev.marksAwarded < 0 || ev.marksAwarded > ans.question.marks) {
          throw new BadRequestException(`Awarded marks (${ev.marksAwarded}) cannot exceed maximum allowed marks (${ans.question.marks}) for question "${ans.question.questionText}".`);
        }
        ans.marksAwarded = ev.marksAwarded;
        ans.evaluatorComment = ev.evaluatorComment || '';
        ans.evaluatedBy = 'Human';
        newMarksAdded += ev.marksAwarded;
      }
    }

    submission.marksObtained += newMarksAdded;
    submission.status = 'Evaluated';
    
    // Save answers
    await this.answerRepo.save(submission.answers);
    const savedSub = await this.submissionRepo.save(submission);

    // Send notification to the student
    try {
      const fullSubmission = await this.submissionRepo.findOne({
        where: { id: savedSub.id },
        relations: { user: true, test: true }
      });
      if (fullSubmission && fullSubmission.user) {
        const notification = new Notification();
        notification.message = `Your submission for test "${fullSubmission.test.title}" has been evaluated.`;
        notification.user = fullSubmission.user;
        notification.actionLink = `/dashboard?tab=my-learning`;
        const savedNotif = await this.notificationRepo.save(notification);

        this.notificationsGateway.sendNotificationToUser(fullSubmission.user.userId, {
          id: savedNotif.id,
          message: savedNotif.message,
          actionLink: savedNotif.actionLink,
          createdAt: savedNotif.createdAt,
          isRead: false
        });
      }
    } catch (notifErr) {
      console.error(`[Notification] Failed to notify user for manual evaluation:`, notifErr);
    }

    return savedSub;
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

  private deletePhysicalFile(fileLink: string) {
    if (fileLink && fileLink.startsWith('/uploads/')) {
      const filePath = path.resolve('.', fileLink.replace(/^[/\\]+/, ''));
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`[Trash Cleanup] Successfully deleted orphaned reference script: ${filePath}`);
        }
      } catch (err) {
        console.error(`[Trash Cleanup] Failed to delete orphaned reference script: ${filePath}`, err);
      }
    }
  }

  async updateQuestion(
    questionId: number,
    data: { questionText?: string; options?: string[]; correctAnswers?: string[]; marks?: number; postureMarks?: number; voiceMarks?: number; accuracyMarks?: number; evaluationType?: string; referenceScript?: string },
    role: string,
  ) {
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException('Only admin or employee can edit questions');
    }
    const question = await this.questionRepo.findOne({ where: { id: questionId }, relations: { test: true } });
    if (!question) throw new NotFoundException('Question not found');

    if (data.questionText !== undefined) question.questionText = data.questionText;
    if (data.options !== undefined) question.options = data.options;
    if (data.correctAnswers !== undefined) question.correctAnswers = data.correctAnswers;
    if (data.marks !== undefined) question.marks = data.marks;
    if (data.postureMarks !== undefined) question.postureMarks = data.postureMarks;
    if (data.voiceMarks !== undefined) question.voiceMarks = data.voiceMarks;
    if (data.accuracyMarks !== undefined) question.accuracyMarks = data.accuracyMarks;
    if (data.evaluationType !== undefined) question.evaluationType = data.evaluationType;

    if (data.referenceScript !== undefined && question.type === 'Video' && question.test) {
      const oldScript = question.test.referenceScript;
      
      // If there was an old file path, and it is different from the new script, delete it!
      if (oldScript && oldScript !== data.referenceScript) {
        const isOldFile = oldScript.startsWith("http") || 
                          oldScript.startsWith("/") ||
                          (oldScript.length < 200 && /\.(pdf|docx|doc|pptx|ppt)$/i.test(oldScript));
        if (isOldFile) {
          let pathPart = oldScript;
          if (pathPart.includes('/uploads/')) {
            pathPart = '/uploads/' + pathPart.split('/uploads/').pop();
          }
          this.deletePhysicalFile(pathPart);
        }
      }

      question.test.referenceScript = data.referenceScript || undefined;
      await this.testRepo.save(question.test);
    }

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

  async updateTest(testId: number, dto: UpdateTestDto, role: string) {
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException('Only admin or employee can edit test configuration');
    }
    const test = await this.testRepo.findOne({ where: { id: testId } });
    if (!test) throw new NotFoundException('Test not found');

    if (dto.title !== undefined) test.title = dto.title;
    if (dto.description !== undefined) test.description = dto.description;
    if (dto.referenceScript !== undefined) test.referenceScript = dto.referenceScript || undefined;
    if (dto.startTime !== undefined) test.startTime = dto.startTime ? new Date(dto.startTime) : undefined as any;
    if (dto.endTime !== undefined) test.endTime = dto.endTime ? new Date(dto.endTime) : undefined as any;

    // Recalculate status for Standalone exams if times changed
    if (test.testType === 'Standalone') {
      const now = new Date();
      if (test.startTime && now < test.startTime) {
        test.status = 'scheduled';
      } else if (test.endTime && now > test.endTime) {
        test.status = 'completed';
      } else {
        test.status = 'active';
      }
    }

    return this.testRepo.save(test);
  }

  async deleteTest(testId: number): Promise<{ success: boolean; message: string }> {
    const test = await this.testRepo.findOne({ where: { id: testId } });
    if (!test) {
      throw new NotFoundException('Test not found');
    }
    await this.testRepo.remove(test);
    return { success: true, message: 'Test successfully deleted' };
  }
}
