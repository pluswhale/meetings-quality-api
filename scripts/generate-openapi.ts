/**
 * Generate OpenAPI JSON specification file
 * This allows frontend to generate API client without backend running
 */

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import * as fs from 'fs';
import * as path from 'path';

async function generateOpenApiSpec() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error'],
  });

  const config = new DocumentBuilder()
    .setTitle('Meetings Quality API')
    .setDescription('API для платформы отслеживания качества встреч')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('auth', 'Аутентификация и авторизация')
    .addTag('users', 'Управление пользователями')
    .addTag('meetings', 'Управление встречами')
    .addTag('tasks', 'Управление задачами')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Create generated directory if it doesn't exist
  const generatedDir = path.join(__dirname, '..', 'generated');
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }

  // Write OpenAPI spec to file
  const outputPath = path.join(generatedDir, 'openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));

  console.log('✅ OpenAPI specification generated successfully!');
  console.log(`📄 File: ${outputPath}`);
  console.log(`📦 You can now use this file in your frontend orval config`);

  await app.close();
}

generateOpenApiSpec()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to generate OpenAPI spec:', error);
    process.exit(1);
  });
