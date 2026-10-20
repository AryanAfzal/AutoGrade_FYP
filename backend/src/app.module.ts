import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
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
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DATABASE_HOST') || process.env.DATABASE_HOST || 'localhost',
        port: parseInt(config.get<string>('DATABASE_PORT') || process.env.DATABASE_PORT || '5432', 10),
        username: config.get<string>('DATABASE_USER') || process.env.DATABASE_USER || 'postgres',
        password: String(config.get<string>('DATABASE_PASS') ?? process.env.DATABASE_PASS ?? 'postgres'),
        database: config.get<string>('DATABASE_NAME') || process.env.DATABASE_NAME || 'autograde',
        autoLoadEntities: true,
        synchronize: true, // dev only — creates tables automatically
      }),
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
