import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnswerSheet } from './entities/answer-sheet.entity';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([AnswerSheet])],
  providers: [UploadsService, RolesGuard],
  controllers: [UploadsController],
  exports: [UploadsService],
})
export class UploadsModule {}