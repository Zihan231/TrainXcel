import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @IsNotEmpty({ message: 'Course name is required' })
  name: string;


  @IsString()
  @IsNotEmpty({ message: 'User ID is required' })
  userId: string;

  @IsNumber()
  @IsOptional()
  categoryId?: number;

  @IsString()
  @IsOptional()
  @IsIn(['active', 'inactive', 'draft'], { message: 'Status must be active, inactive, or draft' })
  status?: string;
}
