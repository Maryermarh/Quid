import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationChannel,
  NotificationChannelName,
  NotificationEnvelope,
} from './notification-channel';

/**
 * Issue #314, webhook channel: POSTs the alert as JSON to
 * `NOTIFICATION_WEBHOOK_URL` so an operator can wire it to Slack, Discord, or a
 * transactional email provider of their choice without a code change here.
 *
 * The channel stays disabled until a URL is configured, and any non-2xx
 * response is treated as a delivery failure so the dispatcher can retry or mark
 * the attempt without breaking the indexer.
 */
@Injectable()
export class WebhookChannel implements NotificationChannel {
  readonly name: NotificationChannelName = 'WEBHOOK';

  private readonly logger = new Logger(WebhookChannel.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return Boolean(this.webhookUrl());
  }

  async deliver(envelope: NotificationEnvelope): Promise<void> {
    const url = this.webhookUrl();

    if (!url) {
      throw new Error('NOTIFICATION_WEBHOOK_URL is not configured');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        event: envelope.type,
        notificationId: envelope.notificationId,
        recipient: envelope.recipientAddress,
        subject: envelope.subject,
        body: envelope.body,
        missionId: envelope.missionId,
        submissionId: envelope.submissionId,
        rejectionReason: envelope.rejectionReason,
        rewardAmount: envelope.rewardAmount,
        rewardToken: envelope.rewardToken,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Webhook responded with ${response.status} ${response.statusText}`,
      );
    }

    this.logger.debug(
      `Webhook alert delivered for ${envelope.recipientAddress}: ${envelope.subject}`,
    );
  }

  private webhookUrl(): string | undefined {
    const url = this.config.get<string>('NOTIFICATION_WEBHOOK_URL');
    return url && url.trim().length > 0 ? url.trim() : undefined;
  }
}
