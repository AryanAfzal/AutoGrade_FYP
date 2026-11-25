import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ExamsModule } from './exams/exams.module';
import { UploadsModule } from './uploads/uploads.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { InstitutionsModule } from './institutions/institutions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbUrl = config.get<string>('DATABASE_URL') || process.env.DATABASE_URL;
        const useSsl =
          process.env.DATABASE_SSL === 'true' ||
          (Boolean(dbUrl) && !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1'));

        if (dbUrl) {
          return {
            type: 'postgres',
            url: dbUrl,
            ssl: useSsl ? { rejectUnauthorized: false } : false,
            autoLoadEntities: true,
            synchronize: true, // creates/syncs tables automatically
          };
        }

        return {
          type: 'postgres',
          host: config.get<string>('DATABASE_HOST') || process.env.DATABASE_HOST || 'localhost',
          port: parseInt(config.get<string>('DATABASE_PORT') || process.env.DATABASE_PORT || '5432', 10),
          username: config.get<string>('DATABASE_USER') || process.env.DATABASE_USER || 'postgres',
          password: String(config.get<string>('DATABASE_PASS') ?? process.env.DATABASE_PASS ?? 'postgres'),
          database: config.get<string>('DATABASE_NAME') || process.env.DATABASE_NAME || 'autograde',
          ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
          autoLoadEntities: true,
          synchronize: true,
        };
      },
    }),
    AuthModule,
    UsersModule,
    ExamsModule,
    UploadsModule,
    EvaluationModule,
    AnalyticsModule,
    InstitutionsModule,
  ],
})
export class AppModule {}
