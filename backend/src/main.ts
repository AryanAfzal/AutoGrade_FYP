import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  app.enableCors({
    origin: (process.env.FRONTEND_URL || 'http://localhost:3000')
      .split(',')
      .map((value) => value.trim().replace(/\/$/, '')),
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
}
bootstrap();
