import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { InAppChannel } from './in-app.channel';
import { NotificationsService } from './notifications.service';
import { WebhookChannel } from './webhook.channel';

const MISSION_ID = 'mission-1';
const HUNTER = 'GHUNTER1111111111111111111111111111111111111111111111111';
const HUNTER_EMAIL = 'hunter@example.com';
const SUBMISSION_ID = 'sub-1';

const submissionRow = {
  id: SUBMISSION_ID,
  missionId: MISSION_ID,
  hunterAddress: HUNTER,
  rejectionReason: null as string | null,
  mission: {
    title: 'Test the dApp',
    rewardAmount: '100',
    rewardToken: 'USDC',
  },
  hunter: { email: HUNTER_EMAIL as string | null },
};

const storedNotification = {
  id: 'notification-1',
  recipientAddress: HUNTER,
  type: 'SUBMISSION_PAID',
  subject: 'Paid: Test the dApp',
  body: 'Your submission was accepted.',
  missionId: MISSION_ID,
  submissionId: SUBMISSION_ID,
  payload: {
    missionId: MISSION_ID,
    submissionId: SUBMISSION_ID,
    hunterAddress: HUNTER,
    missionTitle: 'Test the dApp',
    rewardAmount: '100',
    rewardToken: 'USDC',
    rejectionReason: null,
    hunterEmail: HUNTER_EMAIL,
  },
};

function deliveryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'delivery-1',
    channel: 'IN_APP',
    status: 'PENDING',
    attempts: 0,
    lastError: null,
    deliveredAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    notificationId: 'notification-1',
    notification: storedNotification,
    ...overrides,
  };
}

describe('NotificationsService (issue #314)', () => {
  let service: NotificationsService;
  let prisma: {
    submission: { findUnique: jest.Mock };
    notification: { create: jest.Mock; findUnique: jest.Mock };
    notificationDelivery: {
      createMany: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let config: { get: jest.Mock };

  beforeEach(() => {
    prisma = {
      submission: { findUnique: jest.fn() },
      notification: { create: jest.fn(), findUnique: jest.fn() },
      notificationDelivery: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    config = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const inApp = new InAppChannel(prisma as unknown as PrismaService);
    const webhook = new WebhookChannel(config as unknown as ConfigService);

    service = new NotificationsService(
      prisma as unknown as PrismaService,
      inApp,
      webhook,
    );
  });

  describe('notifySubmissionPaid', () => {
    it('queues an alert for the hunter with the payout summary', async () => {
      prisma.submission.findUnique.mockResolvedValue(submissionRow);
      prisma.notification.create.mockResolvedValue({ id: 'notification-1' });

      const id = await service.notifySubmissionPaid(MISSION_ID, HUNTER);

      expect(id).toBe('notification-1');
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipientAddress: HUNTER,
            type: 'SUBMISSION_PAID',
            missionId: MISSION_ID,
            submissionId: SUBMISSION_ID,
            subject: 'Paid: Test the dApp',
            body: expect.stringContaining('100'),
          }),
        }),
      );
    });

    it('queues only the in-app channel when no webhook is configured', async () => {
      prisma.submission.findUnique.mockResolvedValue(submissionRow);
      prisma.notification.create.mockResolvedValue({ id: 'notification-1' });

      await service.notifySubmissionPaid(MISSION_ID, HUNTER);

      expect(prisma.notificationDelivery.createMany).toHaveBeenCalledWith({
        data: [{ notificationId: 'notification-1', channel: 'IN_APP' }],
      });
    });

    it('adds the webhook channel when a webhook url is configured', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'NOTIFICATION_WEBHOOK_URL'
          ? 'https://hooks.example.com'
          : undefined,
      );
      prisma.submission.findUnique.mockResolvedValue(submissionRow);
      prisma.notification.create.mockResolvedValue({ id: 'notification-1' });

      await service.notifySubmissionPaid(MISSION_ID, HUNTER);

      expect(prisma.notificationDelivery.createMany).toHaveBeenCalledWith({
        data: [
          { notificationId: 'notification-1', channel: 'IN_APP' },
          { notificationId: 'notification-1', channel: 'WEBHOOK' },
        ],
      });
    });

    it('records the hunter email in the payload so a channel can address it', async () => {
      prisma.submission.findUnique.mockResolvedValue(submissionRow);
      prisma.notification.create.mockResolvedValue({ id: 'notification-1' });

      await service.notifySubmissionPaid(MISSION_ID, HUNTER);

      const { data } = prisma.notification.create.mock.calls[0][0];
      expect(data.payload).toEqual(
        expect.objectContaining({
          missionId: MISSION_ID,
          submissionId: SUBMISSION_ID,
          hunterAddress: HUNTER,
          hunterEmail: HUNTER_EMAIL,
          missionTitle: 'Test the dApp',
          rewardAmount: '100',
          rewardToken: 'USDC',
          rejectionReason: null,
          type: 'SUBMISSION_PAID',
        }),
      );
    });

    it('returns null when the submission has not been indexed yet', async () => {
      prisma.submission.findUnique.mockResolvedValue(null);

      await expect(
        service.notifySubmissionPaid(MISSION_ID, HUNTER),
      ).resolves.toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('swallows a database failure so the indexer is not crashed', async () => {
      prisma.submission.findUnique.mockRejectedValue(new Error('db down'));

      await expect(
        service.notifySubmissionPaid(MISSION_ID, HUNTER),
      ).resolves.toBeNull();
    });
  });

  describe('notifySubmissionRejected', () => {
    it('includes the rejection reason in the alert body', async () => {
      prisma.submission.findUnique.mockResolvedValue({
        ...submissionRow,
        rejectionReason: 'Off topic',
      });
      prisma.notification.create.mockResolvedValue({ id: 'notification-2' });

      const id = await service.notifySubmissionRejected(MISSION_ID, HUNTER);

      expect(id).toBe('notification-2');
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'SUBMISSION_REJECTED',
            subject: 'Rejected: Test the dApp',
            body: expect.stringContaining('Off topic'),
          }),
        }),
      );
    });

    it('omits the reason sentence when the creator gave none', async () => {
      prisma.submission.findUnique.mockResolvedValue({
        ...submissionRow,
        rejectionReason: null,
      });
      prisma.notification.create.mockResolvedValue({ id: 'notification-2' });

      await service.notifySubmissionRejected(MISSION_ID, HUNTER);

      const { data } = prisma.notification.create.mock.calls[0][0];
      expect(data.body).not.toContain('Reason:');
    });

    it('tells the hunter the stake came back', async () => {
      prisma.submission.findUnique.mockResolvedValue(submissionRow);
      prisma.notification.create.mockResolvedValue({ id: 'notification-2' });

      await service.notifySubmissionRejected(MISSION_ID, HUNTER);

      const { data } = prisma.notification.create.mock.calls[0][0];
      expect(data.body).toContain('stake was returned in full');
    });
  });

  describe('dispatchPending', () => {
    it('marks a successful in-app delivery as SENT', async () => {
      prisma.notificationDelivery.findMany.mockResolvedValue([deliveryRow()]);
      prisma.notification.findUnique.mockResolvedValue({
        id: 'notification-1',
        recipientAddress: HUNTER,
      });

      const delivered = await service.dispatchPending();

      expect(delivered).toBe(1);
      expect(prisma.notificationDelivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: expect.objectContaining({
          status: 'SENT',
          attempts: { increment: 1 },
          lastError: null,
        }),
      });
    });

    it('records the failure and leaves the row retryable when a channel throws', async () => {
      prisma.notificationDelivery.findMany.mockResolvedValue([deliveryRow()]);
      prisma.notification.findUnique.mockResolvedValue(null);

      const delivered = await service.dispatchPending();

      expect(delivered).toBe(0);
      expect(prisma.notificationDelivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: expect.objectContaining({
          status: 'PENDING',
          attempts: { increment: 1 },
          lastError: expect.stringContaining('not readable'),
        }),
      });
    });

    it('gives up on a delivery that has exhausted its attempts', async () => {
      prisma.notificationDelivery.findMany.mockResolvedValue([
        deliveryRow({ attempts: 4 }),
      ]);
      prisma.notification.findUnique.mockResolvedValue(null);

      await service.dispatchPending();

      expect(prisma.notificationDelivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: expect.objectContaining({ status: 'FAILED' }),
      });
    });

    it('leaves a delivery pending while its channel is not configured', async () => {
      prisma.notificationDelivery.findMany.mockResolvedValue([
        deliveryRow({ channel: 'WEBHOOK' }),
      ]);

      const delivered = await service.dispatchPending();

      expect(delivered).toBe(0);
      expect(prisma.notificationDelivery.update).not.toHaveBeenCalled();
    });

    it('keeps dispatching the remaining deliveries after one fails', async () => {
      prisma.notificationDelivery.findMany.mockResolvedValue([
        deliveryRow({ id: 'delivery-1' }),
        deliveryRow({ id: 'delivery-2' }),
      ]);
      prisma.notification.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'notification-1',
          recipientAddress: HUNTER,
        });

      const delivered = await service.dispatchPending();

      expect(delivered).toBe(1);
      expect(prisma.notificationDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'delivery-2' } }),
      );
    });

    it('does nothing when the queue is empty', async () => {
      const delivered = await service.dispatchPending();

      expect(delivered).toBe(0);
      expect(prisma.notificationDelivery.update).not.toHaveBeenCalled();
    });
  });

  describe('dispatchPendingOnCron', () => {
    it('does not throw when the queue query fails', async () => {
      prisma.notificationDelivery.findMany.mockRejectedValue(
        new Error('db down'),
      );

      await expect(service.dispatchPendingOnCron()).resolves.toBeUndefined();
    });
  });
});
