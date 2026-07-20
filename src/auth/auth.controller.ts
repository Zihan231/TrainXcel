import { Controller, Post, Body, Get, HttpCode, HttpStatus, Param, Patch, Query, Res, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import type { Response } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}



  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token } = await this.authService.login(loginDto);
    response.cookie('jwt', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 3600 * 1000, // 1 hour
    });
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('jwt');
    return { message: 'Logged out successfully' };
  }

  // Get current logged-in user profile
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getOwnProfile(@Req() req: any) {
    return this.authService.getUserProfile(req.user.userId);
  }

  @Get('token')
  @UseGuards(JwtAuthGuard)
  async getSocketToken(@Req() req: any) {
    const token = req.cookies?.['jwt'] || req.headers.authorization?.split(' ')[1];
    return { token };
  }

  @Get('users')
  @UseGuards(JwtAuthGuard)
  async getUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.authService.getUsersPaginated(Number(page), Number(limit));
  }

  @Get('users/search')
  @UseGuards(JwtAuthGuard)
  async searchUsers(@Query('q') q: string) {
    return this.authService.searchUsers(q || '');
  }

  @Post('users/employee')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createEmployee(
    @Body() createEmployeeDto: CreateEmployeeDto,
    @Req() req: any,
  ) {
    return this.authService.createEmployee(createEmployeeDto, req.user.userId);
  }

  @Get('profile/:userId')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Param('userId') userId: string) {
    return this.authService.getUserProfile(userId);
  }

  @Patch('users/:userId')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Param('userId') userId: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: any,
  ) {
    return this.authService.updateUserDetails(userId, updateUserDto, req.user.userId);
  }

  @Patch('users/:userId/role')
  @UseGuards(JwtAuthGuard)
  async updateRole(
    @Param('userId') userId: string,
    @Body('role') role: string,
    @Req() req: any,
  ) {
    // The admin's userId is securely extracted from their JWT token
    return this.authService.updateUserRole(userId, role, req.user.userId);
  }
}
