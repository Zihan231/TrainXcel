import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @IsNotEmpty({ message: 'Lesson title is required' })
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['Video', 'PDF', 'PPT'], { message: 'Material Type must be Video, PDF, or PPT' })
  materialType: string;

  @IsUrl({}, { message: 'Material Link must be a valid URL' })
  materialLink: string;

  @IsString()
  @IsOptional()
  @IsIn(['Active', 'Draft'], { message: 'Status must be Active or Draft' })
  status?: string;
}
