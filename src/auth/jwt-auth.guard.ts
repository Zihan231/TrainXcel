import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.jwt;

    if (!token) {
      throw new UnauthorizedException('Authentication token is missing. Please log in.');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      // Attach the user details (userId and role) to the request object
      request.user = payload;
      return true;
    } catch (err) {
      throw new UnauthorizedException('Authentication token is invalid or expired. Please log in again.');
    }
  }
}
