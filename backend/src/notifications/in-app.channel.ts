import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationChannel,
  NotificationChannelName,
  NotificationEnvelope,
} from './notification-channel';

/**
 * Issue #314, in-app channel: the alert is already durable in the
 * `notifications` table, so "delivery" is a read of the recipient's inbox. It
 * always succeeds, which is what makes the MVP acceptance criterion
 * ("at least one channel works for payout and reject") hold with no external
 * service configured.
 */
@Injectable()
export class InAppChannel implements NotificationChannel {
  readonly name: NotificationChannelName = 'IN_APP';

  private readonly logger = new Logger(InAppChannel.name);

  constructor(private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return true;
  }

  async deliver(envelope: NotificationEnvelope): Promise<void> {
    const stored = await this.prisma.notification.findUnique({
      where: { id: envelope.notificationId },
      select: { id: true, recipientAddress: true },
    });

    if (!stored || stored.recipientAddress !== envelope.recipientAddress) {
      throw new Error(
        `Notification ${envelope.notificationId} is not readable by ${envelope.recipientAddress}`,
      );
    }

    this.logger.debug(
      `In-app alert ready for ${envelope.recipientAddress}: ${envelope.subject}`,
    );
  }
}
