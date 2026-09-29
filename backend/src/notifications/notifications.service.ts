import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationChannel,
  NotificationEnvelope,
} from './notification-channel';
import { InAppChannel } from './in-app.channel';
import { WebhookChannel } from './webhook.channel';

export type NotificationType = 'SUBMISSION_PAID' | 'SUBMISSION_REJECTED';

interface SubmissionAlertRow {
  submissionId: string;
  missionId: string;
  hunterAddress: string;
  missionTitle: string;
  rewardAmount: string;
  rewardToken: string;
  rejectionReason: string | null;
  hunterEmail: string | null;
}

const MAX_DISPATCH_ATTEMPTS = 5;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private readonly channels: NotificationChannel[];

  constructor(
    private readonly prisma: PrismaService,
    inAppChannel: InAppChannel,
    webhookChannel: WebhookChannel,
  ) {
    this.channels = [inAppChannel, webhookChannel];
  }

  /**
   * Issue #314: queue a "you were paid" alert for a hunter.
   *
   * Returns `null` when there is no matching submission row, which is the
   * normal case for an on-chain event that has not been indexed yet. Never
   * throws: the indexer must not die because a notification could not be
   * recorded.
   */
  async notifySubmissionPaid(
    missionId: string,
    hunterAddress: string,
  ): Promise<string | null> {
    return this.queueAlert(missionId, hunterAddress, 'SUBMISSION_PAID');
  }

  /**
   * Issue #314: queue a "your submission was rejected" alert for a hunter,
   * carrying the reason the creator gave so the hunter does not have to open
   * the mission to find out why.
   */
  async notifySubmissionRejected(
    missionId: string,
    hunterAddress: string,
  ): Promise<string | null> {
    return this.queueAlert(missionId, hunterAddress, 'SUBMISSION_REJECTED');
  }

  /**
   * Issue #314 acceptance criterion "failures do not crash indexer": every
   * per-delivery error is swallowed and recorded, so a dead webhook can never
   * fail the surrounding indexer tick.
   */
  async dispatchPending(): Promise<number> {
    const pending = await this.prisma.notificationDelivery.findMany({
      where: {
        status: 'PENDING',
        attempts: { lt: MAX_DISPATCH_ATTEMPTS },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: { notification: true },
    });

    let delivered = 0;

    for (const delivery of pending) {
      const channel = this.channels.find(
        (candidate) => candidate.name === delivery.channel,
      );

      if (!channel) {
        await this.markFailed(
          delivery.id,
          delivery.attempts,
          `No channel registered for ${delivery.channel}`,
        );
        continue;
      }

      if (!channel.isEnabled()) {
        // Leave the row pending: a channel that is simply not configured yet
        // should pick the alert up once the operator sets the env var.
        this.logger.debug(
          `Skipping ${delivery.channel} delivery ${delivery.id}: channel not configured`,
        );
        continue;
      }

      try {
        await channel.deliver(this.toEnvelope(delivery.notification));
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'SENT',
            attempts: { increment: 1 },
            deliveredAt: new Date(),
            lastError: null,
          },
        });
        delivered += 1;
      } catch (error) {
        await this.markFailed(
          delivery.id,
          delivery.attempts,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    return delivered;
  }

  /** Cron entrypoint for {@link dispatchPending}. */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async dispatchPendingOnCron(): Promise<void> {
    try {
      const delivered = await this.dispatchPending();

      if (delivered > 0) {
        this.logger.log(`Delivered ${delivered} queued notification(s)`);
      }
    } catch (error) {
      this.logger.error(
        `Notification dispatch tick failed: ${this.describe(error)}`,
      );
    }
  }

  private async queueAlert(
    missionId: string,
    hunterAddress: string,
    type: NotificationType,
  ): Promise<string | null> {
    try {
      const row = await this.prisma.submission.findUnique({
        where: { missionId_hunterAddress: { missionId, hunterAddress } },
        select: {
          id: true,
          missionId: true,
          hunterAddress: true,
          rejectionReason: true,
          mission: {
            select: {
              title: true,
              rewardAmount: true,
              rewardToken: true,
            },
          },
          hunter: { select: { email: true } },
        },
      });

      if (!row) {
        this.logger.warn(
          `No submission for mission ${missionId} and hunter ${hunterAddress}; skipping ${type} alert`,
        );
        return null;
      }

      const alert: SubmissionAlertRow = {
        submissionId: row.id,
        missionId: row.missionId,
        hunterAddress: row.hunterAddress,
        missionTitle: row.mission.title,
        rewardAmount: row.mission.rewardAmount,
        rewardToken: row.mission.rewardToken,
        rejectionReason: row.rejectionReason,
        hunterEmail: row.hunter.email,
      };

      const { subject, body } = this.renderAlert(type, alert);

      const notification = await this.prisma.notification.create({
        data: {
          recipientAddress: row.hunterAddress,
          type,
          subject,
          body,
          missionId: row.missionId,
          submissionId: row.id,
          payload: this.buildPayload(type, alert),
        },
        select: { id: true },
      });

      await this.prisma.notificationDelivery.createMany({
        data: this.channels
          .filter((channel) => channel.isEnabled())
          .map((channel) => ({
            notificationId: notification.id,
            channel: channel.name,
          })),
      });

      this.logger.log(
        `Queued ${type} alert ${notification.id} for ${row.hunterAddress}`,
      );

      return notification.id;
    } catch (error) {
      this.logger.error(
        `Failed to queue ${type} alert for ${hunterAddress} on mission ${missionId}: ${this.describe(error)}`,
      );
      return null;
    }
  }

  private renderAlert(
    type: NotificationType,
    row: SubmissionAlertRow,
  ): { subject: string; body: string } {
    if (type === 'SUBMISSION_PAID') {
      return {
        subject: `Paid: ${row.missionTitle}`,
        body: `Your submission for "${row.missionTitle}" was accepted and ${row.rewardAmount} of ${row.rewardToken} was paid out. Your stake was returned in full.`,
      };
    }

    const reason = row.rejectionReason ? ` Reason: ${row.rejectionReason}` : '';

    return {
      subject: `Rejected: ${row.missionTitle}`,
      body: `Your submission for "${row.missionTitle}" was rejected and your stake was returned in full.${reason}`,
    };
  }

  private buildPayload(
    type: NotificationType,
    row: SubmissionAlertRow,
  ): Prisma.InputJsonValue {
    return {
      missionId: row.missionId,
      submissionId: row.submissionId,
      hunterAddress: row.hunterAddress,
      // Carried so a future email channel can address the alert without
      // re-querying, and so the webhook gets a routable recipient.
      hunterEmail: row.hunterEmail,
      missionTitle: row.missionTitle,
      rewardAmount: row.rewardAmount,
      rewardToken: row.rewardToken,
      rejectionReason: row.rejectionReason,
      type,
    };
  }

  private toEnvelope(notification: {
    id: string;
    recipientAddress: string;
    type: string;
    subject: string;
    body: string;
    missionId: string | null;
    submissionId: string | null;
    payload: unknown;
  }): NotificationEnvelope {
    const payload = (notification.payload ?? {}) as Record<string, unknown>;

    return {
      notificationId: notification.id,
      recipientAddress: notification.recipientAddress,
      recipientEmail:
        typeof payload.hunterEmail === 'string' ? payload.hunterEmail : null,
      type: notification.type as NotificationEnvelope['type'],
      subject: notification.subject,
      body: notification.body,
      missionId: notification.missionId,
      submissionId: notification.submissionId,
      rejectionReason:
        typeof payload.rejectionReason === 'string'
          ? payload.rejectionReason
          : null,
      rewardAmount:
        typeof payload.rewardAmount === 'string' ? payload.rewardAmount : null,
      rewardToken:
        typeof payload.rewardToken === 'string' ? payload.rewardToken : null,
    };
  }

  private async markFailed(
    deliveryId: string,
    attempts: number,
    reason: string,
  ): Promise<void> {
    this.logger.warn(
      `Notification delivery ${deliveryId} failed on attempt ${attempts + 1}: ${reason}`,
    );

    try {
      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: attempts + 1 >= MAX_DISPATCH_ATTEMPTS ? 'FAILED' : 'PENDING',
          attempts: { increment: 1 },
          lastError: reason,
        },
      });
    } catch (error) {
      this.logger.error(
        `Could not record failure for delivery ${deliveryId}: ${this.describe(error)}`,
      );
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
