import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { MissionsService } from './missions.service';
import { MissionListSort } from './dto/list-missions-query.dto';
import { MissionStatus, SubmissionStatus } from '@prisma/client';

const listInclude = {
  owner: { select: { address: true, displayName: true } },
  _count: { select: { submissions: true } },
};

const detailInclude = {
  owner: { select: { address: true, displayName: true, email: true } },
  _count: { select: { submissions: true } },
};

describe('MissionsService', () => {
  let service: MissionsService;
  let prisma: {
    mission: { findMany: jest.Mock; findUnique: jest.Mock };
    submission: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };

    missionDraft: {
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      mission: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      submission: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },

      missionDraft: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    service = new MissionsService(prisma as unknown as PrismaService);
  });

  describe('listPublicMissions', () => {
    it('applies filters, newest sort, and limit to the public mission query', async () => {
      prisma.mission.findMany.mockResolvedValue([]);

      await service.listPublicMissions({
        status: 'OPEN',
        sort: MissionListSort.NEWEST,
        limit: 5,
      });

      expect(prisma.mission.findMany).toHaveBeenCalledWith({
        where: { status: MissionStatus.OPEN },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: listInclude,
      });
    });

    it('normalizes lowercase status values before querying Prisma', async () => {
      prisma.mission.findMany.mockResolvedValue([]);

      await service.listPublicMissions({ status: 'open' });

      expect(prisma.mission.findMany).toHaveBeenCalledWith({
        where: { status: MissionStatus.OPEN },
        orderBy: { createdAt: 'desc' },
        take: undefined,
        include: listInclude,
      });
    });

    it('uses default newest ordering when no query params are provided', async () => {
      prisma.mission.findMany.mockResolvedValue([]);

      await service.listPublicMissions({});

      expect(prisma.mission.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        take: undefined,
        include: listInclude,
      });
    });

    it('supports oldest sorting for public mission discovery', async () => {
      prisma.mission.findMany.mockResolvedValue([]);

      await service.listPublicMissions({ sort: MissionListSort.OLDEST });

      expect(prisma.mission.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'asc' },
        take: undefined,
        include: listInclude,
      });
    });

    it('includes owner address, displayName, and submission count in list results', async () => {
      const mockMission = {
        id: 'mission-1',
        owner: { address: '0xabc', displayName: 'Alice' },
        _count: { submissions: 3 },
      };
      prisma.mission.findMany.mockResolvedValue([mockMission]);

      const result = (await service.listPublicMissions(
        {},
      )) as (typeof mockMission)[];

      expect(result[0].owner.address).toBe('0xabc');
      expect(result[0].owner.displayName).toBe('Alice');
      expect(result[0]._count.submissions).toBe(3);
    });
  });

  describe('getMission', () => {
    it('returns a mission with owner address, displayName, email, and submission count', async () => {
      const mockMission = {
        id: 'mission-1',
        owner: {
          address: '0xabc',
          displayName: 'Alice',
          email: 'alice@example.com',
        },
        _count: { submissions: 5 },
      };
      prisma.mission.findUnique.mockResolvedValue(mockMission);

      const result = (await service.getMission(
        'mission-1',
      )) as typeof mockMission;

      expect(prisma.mission.findUnique).toHaveBeenCalledWith({
        where: { id: 'mission-1' },
        include: detailInclude,
      });
      expect(result.owner.email).toBe('alice@example.com');
      expect(result._count.submissions).toBe(5);
    });

    it('throws NotFoundException when mission does not exist', async () => {
      prisma.mission.findUnique.mockResolvedValue(null);

      await expect(service.getMission('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMissionSubmissions', () => {
    it('returns submissions ordered by createdAt desc for the mission owner', async () => {
      prisma.mission.findUnique.mockResolvedValue({
        id: 'mission-1',
        ownerAddress: '0xabc',
      });
      const mockSubmissions = [
        { id: 'sub-2', createdAt: new Date('2026-01-02') },
        { id: 'sub-1', createdAt: new Date('2026-01-01') },
      ];
      prisma.submission.findMany.mockResolvedValue(mockSubmissions);

      const result = await service.getMissionSubmissions('mission-1', '0xabc');

      expect(result).toEqual(mockSubmissions);
      expect(prisma.submission.findMany).toHaveBeenCalledWith({
        where: { missionId: 'mission-1' },
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
    });

    it('throws NotFoundException when mission does not exist', async () => {
      prisma.mission.findUnique.mockResolvedValue(null);

      await expect(
        service.getMissionSubmissions('nonexistent', '0xabc'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user is not the mission owner', async () => {
      prisma.mission.findUnique.mockResolvedValue({
        id: 'mission-1',
        ownerAddress: '0xabc',
      });

      await expect(
        service.getMissionSubmissions('mission-1', '0xother'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('submission review', () => {
    beforeEach(() => {
      prisma.mission.findUnique.mockResolvedValue({
        ownerAddress: '0xowner',
      });
      prisma.submission.findUnique
        .mockResolvedValueOnce({
          id: 'sub-1',
          missionId: 'mission-1',
          status: SubmissionStatus.PENDING,
        })
        .mockResolvedValueOnce({
          id: 'sub-1',
          missionId: 'mission-1',
          status: SubmissionStatus.APPROVED,
        });
      prisma.submission.updateMany.mockResolvedValue({ count: 1 });
    });

    it('approves a pending submission for the mission owner', async () => {
      const result = await service.approveSubmission(
        'mission-1',
        'sub-1',
        '0xowner',
      );

      expect(prisma.submission.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'sub-1',
          missionId: 'mission-1',
          status: SubmissionStatus.PENDING,
        },
        data: {
          status: SubmissionStatus.APPROVED,
          rejectionReason: null,
        },
      });
      expect(result).toEqual(
        expect.objectContaining({ status: SubmissionStatus.APPROVED }),
      );
    });

    it('rejects a pending submission and persists the trimmed reason', async () => {
      prisma.submission.findUnique
        .mockReset()
        .mockResolvedValueOnce({
          id: 'sub-1',
          missionId: 'mission-1',
          status: SubmissionStatus.PENDING,
        })
        .mockResolvedValueOnce({
          id: 'sub-1',
          status: SubmissionStatus.REJECTED,
          rejectionReason: 'Incomplete work',
        });

      await service.rejectSubmission(
        'mission-1',
        'sub-1',
        '0xowner',
        '  Incomplete work  ',
      );

      expect(prisma.submission.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: SubmissionStatus.REJECTED,
            rejectionReason: 'Incomplete work',
          },
        }),
      );
    });

    it('returns 403 without changing the submission for a non-owner', async () => {
      await expect(
        service.approveSubmission('mission-1', 'sub-1', '0xother'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.submission.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a transition from a terminal review status', async () => {
      prisma.submission.findUnique.mockReset().mockResolvedValue({
        id: 'sub-1',
        missionId: 'mission-1',
        status: SubmissionStatus.REJECTED,
      });

      await expect(
        service.approveSubmission('mission-1', 'sub-1', '0xowner'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.submission.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a concurrent transition when the pending update loses the race', async () => {
      prisma.submission.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.approveSubmission('mission-1', 'sub-1', '0xowner'),
      ).rejects.toThrow(ConflictException);
    });

    it('returns 404 when the submission belongs to another mission', async () => {
      prisma.submission.findUnique.mockReset().mockResolvedValue({
        id: 'sub-1',
        missionId: 'mission-2',
        status: SubmissionStatus.PENDING,
      });

      await expect(
        service.rejectSubmission('mission-1', 'sub-1', '0xowner'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('saveDraft', () => {
    it('creates a draft when no existing draft is found', async () => {
      prisma.missionDraft.findFirst.mockResolvedValue(null);
      const createdDraft = {
        id: 'draft-1',
        ownerAddress: '0xabc',
        title: 'New Draft',
        data: { field: 'value' },
      };
      prisma.missionDraft.create.mockResolvedValue(createdDraft);

      const result = await service.saveDraft('0xabc', {
        title: 'New Draft',
        data: { field: 'value' },
      });

      expect(prisma.missionDraft.findFirst).toHaveBeenCalledWith({
        where: { ownerAddress: '0xabc', publishedMissionId: null },
        orderBy: { updatedAt: 'desc' },
      });
      expect(prisma.missionDraft.create).toHaveBeenCalledWith({
        data: {
          ownerAddress: '0xabc',
          title: 'New Draft',
          data: { field: 'value' },
        },
      });
      expect(prisma.missionDraft.update).not.toHaveBeenCalled();
      expect(result).toEqual(createdDraft);
    });

    it('converts null data to Prisma.JsonNull when creating a draft', async () => {
      prisma.missionDraft.findFirst.mockResolvedValue(null);
      const createdDraft = {
        id: 'draft-2',
        ownerAddress: '0xabc',
        title: 'Null Draft',
        data: Prisma.JsonNull,
      };
      prisma.missionDraft.create.mockResolvedValue(createdDraft);

      const result = await service.saveDraft('0xabc', {
        title: 'Null Draft',
        data: null,
      });

      expect(prisma.missionDraft.create).toHaveBeenCalledWith({
        data: {
          ownerAddress: '0xabc',
          title: 'Null Draft',
          data: Prisma.JsonNull,
        },
      });
      expect(result).toEqual(createdDraft);
    });

    it('converts null data to Prisma.JsonNull when updating a draft', async () => {
      const existingDraft = {
        id: 'draft-1',
        ownerAddress: '0xabc',
        title: 'Old Draft',
        data: { old: true },
        updatedAt: new Date('2026-01-01'),
      };
      prisma.missionDraft.findFirst.mockResolvedValue(existingDraft);
      const updatedDraft = {
        id: 'draft-1',
        ownerAddress: '0xabc',
        title: 'Null Draft',
        data: Prisma.JsonNull,
      };
      prisma.missionDraft.update.mockResolvedValue(updatedDraft);

      const result = await service.saveDraft('0xabc', {
        title: 'Null Draft',
        data: null,
      });

      expect(prisma.missionDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft-1' },
        data: {
          title: 'Null Draft',
          data: Prisma.JsonNull,
        },
      });
      expect(prisma.missionDraft.create).not.toHaveBeenCalled();
      expect(result).toEqual(updatedDraft);
    });

    it('updates the latest draft when one exists', async () => {
      const existingDraft = {
        id: 'draft-1',
        ownerAddress: '0xabc',
        title: 'Old Draft',
        data: { old: true },
        updatedAt: new Date('2026-01-01'),
      };
      prisma.missionDraft.findFirst.mockResolvedValue(existingDraft);
      const updatedDraft = {
        id: 'draft-1',
        ownerAddress: '0xabc',
        title: 'Updated Draft',
        data: { field: 'updated' },
      };
      prisma.missionDraft.update.mockResolvedValue(updatedDraft);

      const result = await service.saveDraft('0xabc', {
        title: 'Updated Draft',
        data: { field: 'updated' },
      });

      expect(prisma.missionDraft.findFirst).toHaveBeenCalledWith({
        where: { ownerAddress: '0xabc', publishedMissionId: null },
        orderBy: { updatedAt: 'desc' },
      });
      expect(prisma.missionDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft-1' },
        data: {
          title: 'Updated Draft',
          data: { field: 'updated' },
        },
      });
      expect(prisma.missionDraft.create).not.toHaveBeenCalled();
      expect(result).toEqual(updatedDraft);
    });
  });

  describe('getLatestDraft', () => {
    it('returns the most recently updated draft for the owner', async () => {
      const latestDraft = {
        id: 'draft-2',
        ownerAddress: '0xabc',
        title: 'Latest Draft',
        data: { step: 3 },
      };
      prisma.missionDraft.findFirst.mockResolvedValue(latestDraft);

      await expect(service.getLatestDraft('0xabc')).resolves.toEqual(
        latestDraft,
      );
      expect(prisma.missionDraft.findFirst).toHaveBeenCalledWith({
        where: { ownerAddress: '0xabc', publishedMissionId: null },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('throws NotFoundException when the owner has no draft', async () => {
      prisma.missionDraft.findFirst.mockResolvedValue(null);

      await expect(service.getLatestDraft('0xabc')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
