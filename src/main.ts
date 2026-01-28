import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve generated OpenAPI file statically (only in development)
  if (process.env.NODE_ENV !== 'production') {
    try {
      app.useStaticAssets(join(__dirname, '..', 'generated'), {
        prefix: '/generated',
      });
    } catch (error) {
      console.log('⚠️  Generated folder not found, skipping static assets');
    }
  }

  // Enable CORS
  app.enableCors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:3001/',
      'http://209.38.214.211',
      'http://localhost:3000',
      'https://pluswhale.github.io',
      'http://192.168.0.100:3000',
      'https://pluswhale.github.io/meetings-quality',
    ],
    credentials: true,
  });

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Swagger configuration (only in development to save memory)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Meetings Quality API')
      .setDescription('API для платформы отслеживания качества встреч')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token',
        },
        'JWT-auth',
      )
      .addTag('auth', 'Аутентификация и авторизация')
      .addTag('users', 'Управление пользователями')
      .addTag('meetings', 'Управление встречами')
      .addTag('tasks', 'Управление задачами')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
    console.log('📚 Swagger documentation enabled at: /api');
  }

  const port = parseInt(process.env.PORT, 10) || 3002;

  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 Attempting to bind to port: ${port}`);

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Application is running on: http://0.0.0.0:${port}`);
  console.log(`✅ Server successfully started!`);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
});
