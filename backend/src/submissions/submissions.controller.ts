import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Submission } from '@prisma/client';
import { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { SubmissionSyncService } from './submission-sync.service';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    address: string;
  };
}

/**
 * Optional optimistic write for hunters (#310). The indexer remains the
 * source of truth; see docs/submission-sync.md.
 */
@Controller('missions')
export class SubmissionsController {
  constructor(private readonly submissionSync: SubmissionSyncService) {}

  /**
   * POST /missions/:id/submissions — record a submission after the hunter's
   * `submit_feedback` transaction. The hunter is always the authenticated
   * wallet; it cannot be supplied in the body.
   */
  @Post(':id/submissions')
  @UseGuards(JwtAuthGuard)
  create(
    @Param('id') missionId: string,
    @Body() dto: CreateSubmissionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<Submission> {
    return this.submissionSync.recordSubmission(
      missionId,
      req.user.address,
      dto,
    );
  }
}
