import { IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateLessonDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsIn(['Video', 'PDF', 'PPT'], { message: 'Material Type must be Video, PDF, or PPT' })
  materialType?: string;

  @IsUrl({}, { message: 'Material Link must be a valid URL' })
  @IsOptional()
  materialLink?: string;

  @IsString()
  @IsOptional()
  @IsIn(['Active', 'Draft'], { message: 'Status must be Active or Draft' })
  status?: string;
}
