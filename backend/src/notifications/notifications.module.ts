import { Global, Module } from '@nestjs/common';
import { InAppChannel } from './in-app.channel';
import { NotificationsService } from './notifications.service';
import { WebhookChannel } from './webhook.channel';

/**
 * Issue #314: `@Global` because both the indexer (which emits alerts on
 * status transitions) and any future mission controller need to queue
 * notifications without each importing the module.
 */
@Global()
@Module({
  providers: [NotificationsService, InAppChannel, WebhookChannel],
  exports: [NotificationsService],
})
export class NotificationsModule {}
