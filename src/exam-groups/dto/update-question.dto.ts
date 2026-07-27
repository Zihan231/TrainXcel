import { IsString, IsArray, IsNumber, IsOptional } from 'class-validator';

export class UpdateQuestionDto {
  @IsString()
  @IsOptional()
  questionText?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  correctAnswers?: string[];

  @IsNumber()
  @IsOptional()
  marks?: number;
}
