import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../src/auth/auth.module';
import { UsersModule } from '../src/users/users.module';
import { ExamsModule } from './exams/exams.module';
import { UploadsModule } from './uploads/uploads.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ 
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASS,
      database: process.env.DATABASE_NAME,
      autoLoadEntities: true,
      synchronize: true, // dev only — creates tables automatically
    }),
    AuthModule,
    UsersModule,
    ExamsModule,
    UploadsModule,
    EvaluationModule,
    AnalyticsModule,
  ],
})
export class AppModule {}