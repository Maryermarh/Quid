import { ConfigService } from '@nestjs/config';
import { SubmissionStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IndexerService } from './indexer.service';

const MISSION_ID = 'mission-1';
const HUNTER = 'GHUNTER1111111111111111111111111111111111111111111111111';

describe('IndexerService (issue #314)', () => {
  let service: IndexerService;
  let prisma: {
    submission: { updateMany: jest.Mock };
    indexerState: { upsert: jest.Mock };
  };
  let notifications: {
    notifySubmissionPaid: jest.Mock;
    notifySubmissionRejected: jest.Mock;
  };
  let config: { get: jest.Mock };

  beforeEach(() => {
    prisma = {
      submission: { updateMany: jest.fn() },
      indexerState: { upsert: jest.fn() },
    };

    notifications = {
      notifySubmissionPaid: jest.fn().mockResolvedValue('notification-1'),
      notifySubmissionRejected: jest.fn().mockResolvedValue('notification-2'),
    };

    config = { get: jest.fn().mockReturnValue(undefined) };

    service = new IndexerService(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('applySubmissionTransition', () => {
    it('alerts the hunter when a submission becomes PAID', async () => {
      prisma.submission.updateMany.mockResolvedValue({ count: 1 });

      await service.applySubmissionTransition({
        missionId: MISSION_ID,
        hunterAddress: HUNTER,
        status: SubmissionStatus.PAID,
      });

      expect(prisma.submission.updateMany).toHaveBeenCalledWith({
        where: {
          missionId: MISSION_ID,
          hunterAddress: HUNTER,
          status: { not: SubmissionStatus.PAID },
        },
        data: { status: SubmissionStatus.PAID, rejectionReason: null },
      });
      expect(notifications.notifySubmissionPaid).toHaveBeenCalledWith(
        MISSION_ID,
        HUNTER,
      );
    });

    it('alerts the hunter when a submission becomes REJECTED', async () => {
      prisma.submission.updateMany.mockResolvedValue({ count: 1 });

      await service.applySubmissionTransition({
        missionId: MISSION_ID,
        hunterAddress: HUNTER,
        status: SubmissionStatus.REJECTED,
        rejectionReason: '  Off topic  ',
      });

      expect(prisma.submission.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: SubmissionStatus.REJECTED,
            rejectionReason: 'Off topic',
          },
        }),
      );
      expect(notifications.notifySubmissionRejected).toHaveBeenCalledWith(
        MISSION_ID,
        HUNTER,
      );
    });

    it('stores a null rejection reason when the event carries none', async () => {
      prisma.submission.updateMany.mockResolvedValue({ count: 1 });

      await service.applySubmissionTransition({
        missionId: MISSION_ID,
        hunterAddress: HUNTER,
        status: SubmissionStatus.REJECTED,
      });

      expect(prisma.submission.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rejectionReason: null }),
        }),
      );
    });

    it('does not re-alert on a replayed event for a status already applied', async () => {
      prisma.submission.updateMany.mockResolvedValue({ count: 0 });

      await service.applySubmissionTransition({
        missionId: MISSION_ID,
        hunterAddress: HUNTER,
        status: SubmissionStatus.PAID,
      });

      expect(notifications.notifySubmissionPaid).not.toHaveBeenCalled();
      expect(notifications.notifySubmissionRejected).not.toHaveBeenCalled();
    });

    it('does not alert for a status that carries no hunter-facing alert', async () => {
      prisma.submission.updateMany.mockResolvedValue({ count: 1 });

      await service.applySubmissionTransition({
        missionId: MISSION_ID,
        hunterAddress: HUNTER,
        status: SubmissionStatus.APPROVED,
      });

      expect(notifications.notifySubmissionPaid).not.toHaveBeenCalled();
      expect(notifications.notifySubmissionRejected).not.toHaveBeenCalled();
    });

    it('does not fail the tick when the notification hook throws', async () => {
      prisma.submission.updateMany.mockResolvedValue({ count: 1 });
      notifications.notifySubmissionPaid.mockRejectedValue(
        new Error('webhook exploded'),
      );

      await expect(
        service.applySubmissionTransition({
          missionId: MISSION_ID,
          hunterAddress: HUNTER,
          status: SubmissionStatus.PAID,
        }),
      ).resolves.toBeUndefined();
    });

    it('surfaces a failed status write instead of swallowing it', async () => {
      prisma.submission.updateMany.mockRejectedValue(new Error('db down'));

      await expect(
        service.applySubmissionTransition({
          missionId: MISSION_ID,
          hunterAddress: HUNTER,
          status: SubmissionStatus.PAID,
        }),
      ).rejects.toThrow('db down');
    });
  });

  describe('pollEvents', () => {
    it('does not touch the checkpoint when chain config is absent', async () => {
      await service.pollEvents();

      expect(prisma.indexerState.upsert).not.toHaveBeenCalled();
    });

    it('upserts the checkpoint when chain config is present', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'RPC_URL' ? 'https://rpc.example' : 'C123',
      );
      prisma.indexerState.upsert.mockResolvedValue({});

      await service.pollEvents();

      expect(prisma.indexerState.upsert).toHaveBeenCalled();
    });
  });
});
