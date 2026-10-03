import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';
import { SubmissionsController } from '../submissions/submissions.controller';
import { SubmissionSyncService } from '../submissions/submission-sync.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MissionsController, SubmissionsController],
  providers: [MissionsService, SubmissionSyncService],
})
export class MissionsModule {}
