import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MissionStatus, Prisma, SubmissionStatus } from '@prisma/client';
import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';

const PAGE_SIZE = 100;
const MAX_PAGES_PER_TICK = 10;
const FIRST_LEDGER = 1;

type EventFields = Record<string, unknown>;

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async pollEvents(): Promise<void> {
    const rpcUrl = this.config.get<string>('RPC_URL');
    const contractId = this.config.get<string>('CONTRACT_ID');

    if (!rpcUrl || !contractId) {
      this.logger.debug(
        'Skipping indexer tick: RPC_URL or CONTRACT_ID is not configured.',
      );
      return;
    }

    try {
      const server = new rpc.Server(rpcUrl);
      let state = await this.prisma.indexerState.upsert({
        where: { id: 1 },
        create: { id: 1, lastLedger: BigInt(0) },
        update: {},
      });
      let cursor = state.lastCursor ?? undefined;
      let pagesProcessed = 0;

      while (pagesProcessed < MAX_PAGES_PER_TICK) {
        const startLedger = this.toLedgerNumber(
          cursor ? state.lastLedger : state.lastLedger + BigInt(1),
        );
        const page = await server.getEvents({
          startLedger: Math.max(FIRST_LEDGER, startLedger),
          filters: [{ type: 'contract', contractIds: [contractId] }],
          limit: PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        });

        if (page.events.length === 0) {
          await this.prisma.indexerState.update({
            where: { id: 1 },
            data: {
              lastLedger: BigInt(page.latestLedger),
              lastCursor: null,
            },
          });
          break;
        }

        const hasMorePages = page.events.length === PAGE_SIZE;
        const lastEvent = page.events[page.events.length - 1];
        const nextCursor = hasMorePages ? page.cursor || lastEvent.id : null;
        const checkpointLedger = hasMorePages
          ? BigInt(lastEvent.ledger)
          : BigInt(page.latestLedger);

        await this.prisma.$transaction(async (tx) => {
          for (const event of page.events) {
            await this.applyEvent(tx, event);
          }

          await tx.indexerState.upsert({
            where: { id: 1 },
            create: {
              id: 1,
              lastLedger: checkpointLedger,
              lastCursor: nextCursor,
            },
            update: {
              lastLedger: checkpointLedger,
              lastCursor: nextCursor,
            },
          });
        });

        pagesProcessed += 1;
        state = {
          ...state,
          lastLedger: checkpointLedger,
          lastCursor: nextCursor,
        };
        cursor = nextCursor ?? undefined;

        if (!hasMorePages) {
          break;
        }
      }

      this.logger.debug(
        `Indexer processed ${pagesProcessed} event page(s) for ${contractId}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Soroban event sync failed: ${message}`, stack);
      throw error;
    }
  }

  private async applyEvent(
    tx: Prisma.TransactionClient,
    event: rpc.Api.EventResponse,
  ): Promise<void> {
    const topics = event.topic.map((topic) => this.decodeNative(topic));
    const eventName = `${String(topics[0])}:${String(topics[1])}`;

    switch (eventName) {
      case 'mission:create':
        await this.applyMissionCreate(tx, event);
        return;
      case 'sub:new':
        await this.applySubmission(tx, event);
        return;
      case 'payout:done':
        await this.applyPayout(tx, event);
        return;
      case 'mission:cancel':
        await this.updateMissionStatus(tx, event, MissionStatus.CANCELLED);
        return;
      case 'mission:pause':
        await this.updateMissionStatus(tx, event, MissionStatus.PAUSED);
        return;
      case 'fee:charged':
        return;
      default:
        this.logger.debug(
          `Ignoring unrecognized quid-store event ${eventName}.`,
        );
    }
  }

  private async applyMissionCreate(
    tx: Prisma.TransactionClient,
    event: rpc.Api.EventResponse,
  ): Promise<void> {
    const fields = this.decodeFields(event.value, [
      'mission_id',
      'owner',
      'title',
      'description_cid',
      'reward_token',
      'reward_amount',
      'max_participants',
      'created_at',
    ]);
    const onChainId = this.requiredString(fields.mission_id, 'mission_id');
    const ownerAddress = this.requiredString(fields.owner, 'owner');
    const title = this.requiredString(fields.title, 'title');
    const descriptionCid = this.requiredString(
      fields.description_cid,
      'description_cid',
    );
    const rewardToken = this.requiredString(
      fields.reward_token,
      'reward_token',
    );
    const rewardAmount = this.requiredString(
      fields.reward_amount,
      'reward_amount',
    );
    const maxParticipants = this.requiredNumber(
      fields.max_participants,
      'max_participants',
    );
    const createdAt = new Date(
      this.requiredNumber(fields.created_at, 'created_at') * 1000,
    );
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error(`Invalid ledger close time for event ${event.id}`);
    }

    await tx.user.upsert({
      where: { address: ownerAddress },
      create: { address: ownerAddress },
      update: {},
    });

    await tx.mission.upsert({
      where: { onChainId },
      create: {
        onChainId,
        indexedFromChain: true,
        ownerAddress,
        title,
        descriptionCid,
        metadataCid: descriptionCid,
        metadata: {},
        rewardToken,
        rewardAmount,
        maxParticipants,
        participantsCount: 0,
        status: MissionStatus.OPEN,
        aiSummary: title,
        createdAt,
      },
      update: {
        ownerAddress,
        title,
        descriptionCid,
        rewardToken,
        rewardAmount,
        maxParticipants,
      },
    });
  }

  private async applySubmission(
    tx: Prisma.TransactionClient,
    event: rpc.Api.EventResponse,
  ): Promise<void> {
    const fields = this.decodeFields(event.value, [
      'mission_id',
      'hunter',
      'ipfs_cid',
    ]);
    const onChainId = this.requiredString(fields.mission_id, 'mission_id');
    const hunterAddress = this.requiredString(fields.hunter, 'hunter');
    const ipfsCid = this.requiredString(fields.ipfs_cid, 'ipfs_cid');
    const mission = await tx.mission.findUnique({
      where: { onChainId },
      select: { id: true },
    });

    if (!mission) {
      throw new Error(
        `Submission event ${event.id} references unknown mission ${onChainId}`,
      );
    }

    await tx.user.upsert({
      where: { address: hunterAddress },
      create: { address: hunterAddress },
      update: {},
    });

    await tx.submission.upsert({
      where: {
        missionId_hunterAddress: {
          missionId: mission.id,
          hunterAddress,
        },
      },
      create: {
        missionId: mission.id,
        hunterAddress,
        ipfsCid,
        status: SubmissionStatus.PENDING,
      },
      update: { ipfsCid },
    });
  }

  private async applyPayout(
    tx: Prisma.TransactionClient,
    event: rpc.Api.EventResponse,
  ): Promise<void> {
    const fields = this.decodeFields(event.value, ['mission_id', 'hunter']);
    const onChainId = this.requiredString(fields.mission_id, 'mission_id');
    const hunterAddress = this.requiredString(fields.hunter, 'hunter');
    const mission = await tx.mission.findUnique({
      where: { onChainId },
    });

    if (!mission) {
      throw new Error(
        `Payout event ${event.id} references unknown mission ${onChainId}`,
      );
    }

    const submission = await tx.submission.findUnique({
      where: {
        missionId_hunterAddress: {
          missionId: mission.id,
          hunterAddress,
        },
      },
    });

    if (!submission) {
      throw new Error(
        `Payout event ${event.id} references unknown submission for ${hunterAddress}`,
      );
    }

    const updated = await tx.submission.updateMany({
      where: {
        id: submission.id,
        status: { not: SubmissionStatus.PAID },
      },
      data: { status: SubmissionStatus.PAID },
    });

    if (updated.count === 0) {
      return;
    }

    const participantsCount = mission.participantsCount + 1;
    await tx.mission.update({
      where: { id: mission.id },
      data: {
        participantsCount: { increment: 1 },
        ...(mission.maxParticipants > 0 &&
        participantsCount >= mission.maxParticipants
          ? { status: MissionStatus.COMPLETED }
          : {}),
      },
    });
  }

  private async updateMissionStatus(
    tx: Prisma.TransactionClient,
    event: rpc.Api.EventResponse,
    status: MissionStatus,
  ): Promise<void> {
    const fields = this.decodeFields(event.value, ['mission_id']);
    const onChainId = this.requiredString(fields.mission_id, 'mission_id');
    const result = await tx.mission.updateMany({
      where: { onChainId },
      data: { status },
    });

    if (result.count !== 1) {
      throw new Error(
        `Mission status event ${event.id} references unknown mission ${onChainId}`,
      );
    }
  }

  private decodeFields(value: xdr.ScVal, names: string[]): EventFields {
    const decoded = this.decodeNative(value);

    if (Array.isArray(decoded)) {
      if (decoded.length < names.length) {
        throw new Error(
          `Expected ${names.length} event fields, received ${decoded.length}`,
        );
      }
      return Object.fromEntries(
        names.map((name, index) => [name, decoded[index]]),
      );
    }

    if (decoded instanceof Map) {
      const entries = new Map(
        Array.from(decoded.entries(), ([key, fieldValue]) => [
          String(key),
          fieldValue,
        ]),
      );
      return Object.fromEntries(
        names.map((name) => {
          const valueForName = entries.get(name);
          if (valueForName === undefined) {
            throw new Error(`Missing ${name} in event payload`);
          }
          return [name, valueForName];
        }),
      );
    }

    if (names.length === 1) {
      return { [names[0]]: decoded };
    }

    throw new Error('Unexpected Soroban event payload encoding');
  }

  private decodeNative(value: xdr.ScVal): unknown {
    return scValToNative(value);
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (typeof value === 'bigint' || typeof value === 'number') {
      return String(value);
    }
    throw new Error(`Invalid ${field} in Soroban event`);
  }

  private requiredNumber(value: unknown, field: string): number {
    const parsed =
      typeof value === 'bigint' || typeof value === 'string'
        ? Number(value)
        : value;
    if (
      typeof parsed !== 'number' ||
      !Number.isSafeInteger(parsed) ||
      parsed < 0
    ) {
      throw new Error(`Invalid ${field} in Soroban event`);
    }
    return parsed;
  }

  private toLedgerNumber(ledger: bigint): number {
    const value = Number(ledger);
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Unsafe ledger value ${ledger.toString()}`);
    }
    return value;
  }
}
