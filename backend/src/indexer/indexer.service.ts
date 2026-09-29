import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface SubmissionStatusTransition {
  missionId: string;
  hunterAddress: string;
  status: SubmissionStatus;
  rejectionReason?: string | null;
}

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // BE-047: 10-second cron scaffold
  @Cron(CronExpression.EVERY_10_SECONDS)
  async pollEvents(): Promise<void> {
    // BE-048: config gating — skip gracefully when chain config is absent
    const rpcUrl = this.config.get<string>('RPC_URL');
    const contractId = this.config.get<string>('CONTRACT_ID');

    if (!rpcUrl || !contractId) {
      this.logger.debug(
        'Skipping indexer tick: RPC_URL or CONTRACT_ID is not configured.',
      );
      return;
    }

    // BE-049: upsert singleton IndexerState checkpoint row
    await this.prisma.indexerState.upsert({
      where: { id: 1 },
      create: { id: 1, lastLedger: BigInt(0) },
      update: {},
    });

    this.logger.debug(
      'Indexer tick complete — IndexerState checkpoint upserted.',
    );
  }

  /**
   * Issue #314: persist a submission status transition seen on-chain and alert
   * the hunter.
   *
   * The status write is the indexer's job and a failure there is a real error
   * worth surfacing. The alert is best-effort: `NotificationsService` swallows
   * and logs its own errors, and the extra guard here means a notification bug
   * can never fail the surrounding indexer tick.
   *
   * The `status: { not: status }` guard is what makes this safe to call for
   * every event in a ledger range: re-reading a status we already applied (a
   * reorg, a second RPC source, a replayed cursor) matches no rows and so does
   * not re-alert the hunter.
   */
  async applySubmissionTransition(
    transition: SubmissionStatusTransition,
  ): Promise<void> {
    const { missionId, hunterAddress, status } = transition;

    const result = await this.prisma.submission.updateMany({
      where: { missionId, hunterAddress, status: { not: status } },
      data: {
        status,
        rejectionReason:
          status === SubmissionStatus.REJECTED
            ? transition.rejectionReason?.trim() || null
            : null,
      },
    });

    if (result.count === 0) {
      this.logger.debug(
        `No submission for mission ${missionId} and hunter ${hunterAddress} moved to ${status}; either it is not indexed yet or it is already ${status}.`,
      );
      return;
    }

    if (status === SubmissionStatus.PAID) {
      await this.safeNotify(() =>
        this.notifications.notifySubmissionPaid(missionId, hunterAddress),
      );
      return;
    }

    if (status === SubmissionStatus.REJECTED) {
      await this.safeNotify(() =>
        this.notifications.notifySubmissionRejected(missionId, hunterAddress),
      );
    }
  }

  private async safeNotify(
    notify: () => Promise<string | null>,
  ): Promise<void> {
    try {
      await notify();
    } catch (error) {
      this.logger.error(
        `Notification hook failed without stopping the indexer: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
