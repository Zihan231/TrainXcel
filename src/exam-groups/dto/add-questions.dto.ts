import {
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class QuestionDto {
  @IsString()
  @IsNotEmpty()
  questionText: string;

  @IsString({ each: true })
  @IsNotEmpty()
  options: string[];

  @IsString({ each: true })
  @IsNotEmpty()
  correctAnswers: string[];

  @IsNumber()
  marks: number;
}

export class AddQuestionsDto {
  @IsNotEmpty({ message: 'At least one question is required' })
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions: QuestionDto[];
}
