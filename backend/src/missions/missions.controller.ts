import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Request } from 'express';
import { MissionsService } from './missions.service';
import { ListMissionsQueryDto } from './dto/list-missions-query.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { RejectSubmissionDto } from './dto/reject-submission.dto';
import { PublishDraftDto } from './dto/publish-draft.dto';
import { AttachMissionDto } from './dto/attach-mission.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Prisma } from '@prisma/client';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    address: string;
  };
}

@Controller('missions')
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Get()
  list(@Query() query: ListMissionsQueryDto): Promise<unknown> {
    return this.missionsService.listPublicMissions(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: AuthenticatedRequest): Promise<unknown> {
    return this.missionsService.getMyMissions(req.user.address);
  }

  @UseGuards(JwtAuthGuard)
  @Get('drafts/me')
  getLatestDraft(
    @Req() req: AuthenticatedRequest,
  ): Promise<Prisma.MissionDraftGetPayload<null>> {
    return this.missionsService.getLatestDraft(req.user.address);
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<unknown> {
    return this.missionsService.getMission(id);
  }

  @Get(':id/submissions')
  @UseGuards(JwtAuthGuard)
  submissions(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<any> {
    return this.missionsService.getMissionSubmissions(id, req.user.address);
  }

  @Post(':missionId/submissions/:id/approve')
  @UseGuards(JwtAuthGuard)
  approveSubmission(
    @Param('missionId') missionId: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.missionsService.approveSubmission(
      missionId,
      id,
      req.user.address,
    );
  }

  @Post(':missionId/submissions/:id/reject')
  @UseGuards(JwtAuthGuard)
  rejectSubmission(
    @Param('missionId') missionId: string,
    @Param('id') id: string,
    @Body() dto: RejectSubmissionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.missionsService.rejectSubmission(
      missionId,
      id,
      req.user.address,
      dto.reason,
    );
  }

  @Post('drafts')
  @UseGuards(JwtAuthGuard)
  saveDraft(
    @Body() dto: SaveDraftDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<Prisma.MissionDraftGetPayload<null>> {
    return this.missionsService.saveDraft(req.user.address, dto);
  }

  @Post('drafts/:draftId/publish')
  @UseGuards(JwtAuthGuard)
  publishDraft(
    @Param('draftId') draftId: string,
    @Body() dto: PublishDraftDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<Prisma.MissionGetPayload<null>> {
    return this.missionsService.publishDraft(draftId, req.user.address, dto);
  }

  @Post(':id/attach')
  @UseGuards(JwtAuthGuard)
  attachMission(
    @Param('id') id: string,
    @Body() dto: AttachMissionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<Prisma.MissionGetPayload<null>> {
    return this.missionsService.attachMission(id, req.user.address, dto);
  }
}
