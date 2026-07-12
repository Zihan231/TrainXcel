  process.env.TZ = 'UTC'; // Force Node to use UTC so DB timestamps aren't shifted by local timezone
  import { NestFactory } from '@nestjs/core';
  import { AppModule } from './app.module';
  import { ValidationPipe } from '@nestjs/common';
  import cookieParser from 'cookie-parser';

  async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.use(cookieParser());
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'http://localhost:3001',
      'http://localhost:3000',
    ].filter(Boolean);

    app.enableCors({
      origin: allowedOrigins,
      credentials: true,
    });
    
    // Enable global validation pipe for DTO validation
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true, // Strips non-decorated properties from DTOs
        transform: true, // Auto-transforms payloads to be DTO instances
      }),
    );

    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    console.log(`Application is running on: http://localhost:${port}`);
  }
  bootstrap();
