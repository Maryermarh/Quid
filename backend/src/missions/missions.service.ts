import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { MissionStatus, Prisma, SubmissionStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ListMissionsQueryDto,
  MissionListSort,
} from './dto/list-missions-query.dto';
import { SaveDraftDto } from './dto/save-draft.dto';

const missionListInclude = {
  owner: {
    select: {
      address: true,
      displayName: true,
    },
  },
  _count: {
    select: { submissions: true },
  },
} as const;

const missionDetailInclude = {
  owner: {
    select: {
      address: true,
      displayName: true,
      email: true,
    },
  },
  _count: {
    select: { submissions: true },
  },
} as const;

type DraftData = Prisma.InputJsonValue | null;

type DraftDataInput = Prisma.JsonNullValueInput | Prisma.InputJsonValue;

function sanitizeDraftData(data: DraftData): DraftDataInput {
  return data === null ? Prisma.JsonNull : data;
}

@Injectable()
export class MissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async listPublicMissions(query: ListMissionsQueryDto): Promise<unknown> {
    const normalizedStatus = query.status?.toUpperCase() as
      MissionStatus | undefined;
    const where = normalizedStatus ? { status: normalizedStatus } : {};
    const orderBy = {
      createdAt: query.sort === MissionListSort.OLDEST ? 'asc' : 'desc',
    } as const;

    const missions = await this.prisma.mission.findMany({
      where,
      orderBy,
      take: query.limit,
      include: missionListInclude,
    });

    return missions;
  }

  async getMyMissions(ownerAddress: string): Promise<unknown> {
    return this.prisma.mission.findMany({
      where: { ownerAddress },
      orderBy: { createdAt: 'desc' },
      include: missionListInclude,
    });
  }

  async getMission(id: string): Promise<unknown> {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: missionDetailInclude,
    });

    if (!mission) {
      throw new NotFoundException(`Mission ${id} not found`);
    }

    return mission;
  }

  async saveDraft(
    ownerAddress: string,
    dto: SaveDraftDto,
  ): Promise<Prisma.MissionDraftGetPayload<null>> {
    const data = sanitizeDraftData(dto.data);

    const latestDraft = await this.prisma.missionDraft.findFirst({
      where: { ownerAddress },
      orderBy: { updatedAt: 'desc' },
    });

    if (latestDraft) {
      const updated = await this.prisma.missionDraft.update({
        where: { id: latestDraft.id },
        data: {
          title: dto.title,
          data,
        },
      });
      return updated;
    }

    const created = await this.prisma.missionDraft.create({
      data: {
        ownerAddress,
        title: dto.title,
        data,
      },
    });
    return created;
  }

  async getLatestDraft(
    ownerAddress: string,
  ): Promise<Prisma.MissionDraftGetPayload<null>> {
    const draft = await this.prisma.missionDraft.findFirst({
      where: { ownerAddress },
      orderBy: { updatedAt: 'desc' },
    });

    if (!draft) {
      throw new NotFoundException('Mission draft not found');
    }

    return draft;
  }

  async getMissionSubmissions(
    missionId: string,
    ownerAddress: string,
  ): Promise<unknown> {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      select: { id: true, ownerAddress: true },
    });

    if (!mission) {
      throw new NotFoundException(`Mission ${missionId} not found`);
    }

    if (mission.ownerAddress !== ownerAddress) {
      throw new ForbiddenException(
        'You are not authorized to view submissions for this mission',
      );
    }

    const submissions = await this.prisma.submission.findMany({
      where: { missionId },
      orderBy: { createdAt: 'desc' },
      include: {
        hunter: {
          select: {
            address: true,
            displayName: true,
          },
        },
      },
    });

    return submissions;
  }

  async approveSubmission(
    missionId: string,
    submissionId: string,
    ownerAddress: string,
  ): Promise<unknown> {
    return this.reviewSubmission(
      missionId,
      submissionId,
      ownerAddress,
      SubmissionStatus.APPROVED,
    );
  }

  async rejectSubmission(
    missionId: string,
    submissionId: string,
    ownerAddress: string,
    reason?: string,
  ): Promise<unknown> {
    return this.reviewSubmission(
      missionId,
      submissionId,
      ownerAddress,
      SubmissionStatus.REJECTED,
      reason,
    );
  }

  private async reviewSubmission(
    missionId: string,
    submissionId: string,
    ownerAddress: string,
    status: SubmissionStatus,
    rejectionReason?: string,
  ): Promise<unknown> {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      select: { ownerAddress: true },
    });

    if (!mission) {
      throw new NotFoundException(`Mission ${missionId} not found`);
    }

    if (mission.ownerAddress !== ownerAddress) {
      throw new ForbiddenException(
        'You are not authorized to review submissions for this mission',
      );
    }

    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, missionId: true, hunterAddress: true, status: true },
    });

    if (!submission || submission.missionId !== missionId) {
      throw new NotFoundException(`Submission ${submissionId} not found`);
    }

    if (submission.status !== SubmissionStatus.PENDING) {
      throw new ConflictException(
        `Submission ${submissionId} cannot transition from ${submission.status} to ${status}`,
      );
    }

    const result = await this.prisma.submission.updateMany({
      where: {
        id: submissionId,
        missionId,
        status: SubmissionStatus.PENDING,
      },
      data: {
        status,
        rejectionReason:
          status === SubmissionStatus.REJECTED
            ? rejectionReason?.trim() || null
            : null,
      },
    });

    if (result.count !== 1) {
      throw new ConflictException(
        `Submission ${submissionId} is no longer pending`,
      );
    }

    // Issue #314: a rejection is the decision a hunter most wants to hear
    // about, so queue the alert here. `NotificationsService` never throws, and
    // the review itself is already committed, so a notification problem must
    // not turn a successful rejection into a 500.
    if (status === SubmissionStatus.REJECTED) {
      await this.notifications.notifySubmissionRejected(
        missionId,
        submission.hunterAddress,
      );
    }

    return this.prisma.submission.findUnique({
      where: { id: submissionId },
    });
  }
}
