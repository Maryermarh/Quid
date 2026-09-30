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
import { PublishDraftDto } from './dto/publish-draft.dto';
import { AttachMissionDto } from './dto/attach-mission.dto';
import { canTransition } from '../submissions/submission-status';

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
      where: { ownerAddress, publishedMissionId: null },
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
      where: { ownerAddress, publishedMissionId: null },
      orderBy: { updatedAt: 'desc' },
    });

    if (!draft) {
      throw new NotFoundException('Mission draft not found');
    }

    return draft;
  }

  async publishDraft(
    draftId: string,
    ownerAddress: string,
    dto: PublishDraftDto,
  ): Promise<Prisma.MissionGetPayload<null>> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const draft = await tx.missionDraft.findUnique({
          where: { id: draftId },
        });

        if (!draft) {
          throw new NotFoundException(`Mission draft ${draftId} not found`);
        }

        if (draft.ownerAddress !== ownerAddress) {
          throw new ForbiddenException(
            'You are not authorized to publish this mission draft',
          );
        }

        if (draft.publishedMissionId) {
          throw new ConflictException(
            `Mission draft ${draftId} has already been published`,
          );
        }

        const existingMission = await tx.mission.findUnique({
          where: { onChainId: dto.onChainId },
        });

        if (existingMission && existingMission.ownerAddress !== ownerAddress) {
          throw new ForbiddenException(
            'The on-chain mission belongs to another owner',
          );
        }
        if (existingMission && !existingMission.indexedFromChain) {
          throw new ConflictException(
            `On-chain mission ${dto.onChainId} is already attached`,
          );
        }

        const missionData = {
          ownerAddress,
          title: draft.title,
          descriptionCid: dto.descriptionCid,
          metadataCid: dto.metadataCid ?? dto.descriptionCid,
          metadata: dto.metadata ?? {},
          rewardToken: dto.rewardToken,
          rewardAmount: dto.rewardAmount,
          maxParticipants: dto.maxParticipants,
          aiSummary: dto.aiSummary ?? draft.title,
        };

        const mission = existingMission
          ? await tx.mission.update({
              where: { id: existingMission.id },
              data: { ...missionData, indexedFromChain: false },
            })
          : await tx.mission.create({
              data: { ...missionData, onChainId: dto.onChainId },
            });

        const updatedDraft = await tx.missionDraft.updateMany({
          where: { id: draftId, publishedMissionId: null },
          data: {
            publishedAt: new Date(),
            publishedMissionId: mission.id,
          },
        });

        if (updatedDraft.count !== 1) {
          throw new ConflictException(
            `Mission draft ${draftId} has already been published`,
          );
        }

        return mission;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `On-chain mission ${dto.onChainId} is already attached`,
        );
      }
      throw error;
    }
  }

  async attachMission(
    missionId: string,
    ownerAddress: string,
    dto: AttachMissionDto,
  ): Promise<Prisma.MissionGetPayload<null>> {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
    });

    if (!mission) {
      throw new NotFoundException(`Mission ${missionId} not found`);
    }

    if (mission.ownerAddress !== ownerAddress) {
      throw new ForbiddenException(
        'You are not authorized to attach this mission',
      );
    }

    const linkedMission = await this.prisma.mission.findUnique({
      where: { onChainId: dto.onChainId },
    });

    if (linkedMission && linkedMission.id !== missionId) {
      throw new ConflictException(
        `On-chain mission ${dto.onChainId} is already attached`,
      );
    }

    try {
      return await this.prisma.mission.update({
        where: { id: missionId },
        data: { onChainId: dto.onChainId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `On-chain mission ${dto.onChainId} is already attached`,
        );
      }
      throw error;
    }
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

    // Shared with the indexer path so review and chain transitions stay
    // consistent with the quid-store enum (#310).
    if (!canTransition(submission.status, status, 'review')) {
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
