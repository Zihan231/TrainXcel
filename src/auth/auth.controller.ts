import { Controller, Post, Body, Get, HttpCode, HttpStatus, Param, Patch, Query, Res, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { Response } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token } = await this.authService.register(registerDto);
    response.cookie('jwt', token, {
      httpOnly: true,
      secure: false, // true in production
      sameSite: 'lax',
      maxAge: 3600 * 1000, // 1 hour
    });
    return user;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token } = await this.authService.login(loginDto);
    response.cookie('jwt', token, {
      httpOnly: true,
      secure: false, // true in production
      sameSite: 'lax',
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

  @Get('users')
  @UseGuards(JwtAuthGuard)
  async getUsers() {
    return this.authService.getAllUsers();
  }

  @Get('users/search')
  @UseGuards(JwtAuthGuard)
  async searchUsers(@Query('q') q: string) {
    return this.authService.searchUsers(q || '');
  }

  @Get('profile/:userId')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Param('userId') userId: string) {
    return this.authService.getUserProfile(userId);
  }

  @Patch('users/:userId')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Param('userId') userId: string, @Body() updateUserDto: UpdateUserDto) {
    return this.authService.updateUserDetails(userId, updateUserDto);
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
