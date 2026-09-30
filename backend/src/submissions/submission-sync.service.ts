import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MissionStatus,
  Prisma,
  Submission,
  SubmissionStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import {
  canTransition,
  ChainSubmissionStatus,
  fromChainStatus,
} from './submission-status';

/** Mission statuses in which `quid-store::submit_feedback` accepts work. */
const ACCEPTING_SUBMISSIONS: readonly MissionStatus[] = [
  MissionStatus.OPEN,
  MissionStatus.STARTED,
];

export interface ChainSubmissionInput {
  missionId: string;
  hunterAddress: string;
  ipfsCid: string;
  status: ChainSubmissionStatus | number;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

/**
 * Submission sync (#310). Source of truth is the chain, read by the indexer;
 * see docs/submission-sync.md.
 *
 * Two writers share one row per (mission, hunter), enforced by the
 * `submissions_mission_id_hunter_address_key` unique index:
 *  - `recordSubmission` (API, optimistic): the hunter posts the hash of their
 *    `submit_feedback` tx so the submission shows up before the indexer runs.
 *    Rows are created PENDING with `chainConfirmed = false`.
 *  - `applyChainSubmission` (indexer): upserts from on-chain state, marks the
 *    row `chainConfirmed = true`, and overwrites the CID with the chain value.
 */
@Injectable()
export class SubmissionSyncService {
  private readonly logger = new Logger(SubmissionSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordSubmission(
    missionId: string,
    hunterAddress: string,
    dto: CreateSubmissionDto,
  ): Promise<Submission> {
    const ipfsCid = dto.ipfsCid.trim();
    const txHash = dto.txHash.toLowerCase();

    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      select: { id: true, status: true },
    });
    if (!mission) {
      throw new NotFoundException(`Mission ${missionId} not found`);
    }

    // Idempotent retries win over the mission-status check: a hunter whose
    // submission is already recorded gets it back even if the mission has
    // since been paused.
    const existing = await this.findForHunter(missionId, hunterAddress);
    if (existing) {
      return this.resolveDuplicate(existing, ipfsCid, txHash);
    }

    if (!ACCEPTING_SUBMISSIONS.includes(mission.status)) {
      throw new ConflictException(
        `Mission ${missionId} is not accepting submissions (status ${mission.status})`,
      );
    }

    try {
      return await this.prisma.submission.create({
        data: {
          missionId,
          hunterAddress,
          ipfsCid,
          txHash,
          status: SubmissionStatus.PENDING,
          chainConfirmed: false,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;

      // Lost a race with a concurrent POST or the indexer for this
      // (mission, hunter): resolve against the row that won.
      const raced = await this.findForHunter(missionId, hunterAddress);
      if (raced) return this.resolveDuplicate(raced, ipfsCid, txHash);

      throw new ConflictException(
        'This transaction hash is already linked to another submission',
      );
    }
  }

  /**
   * Indexer entry point: reconcile the row with on-chain state. The chain is
   * authoritative for the CID; status only moves along chain transitions, and
   * an on-chain Pending never overrides an owner's off-chain review.
   */
  async applyChainSubmission(input: ChainSubmissionInput): Promise<Submission> {
    const chainStatus = fromChainStatus(input.status);
    const { missionId, hunterAddress, ipfsCid } = input;

    let current = await this.findForHunter(missionId, hunterAddress);
    if (!current) {
      try {
        return await this.prisma.submission.create({
          data: {
            missionId,
            hunterAddress,
            ipfsCid,
            status: chainStatus,
            chainConfirmed: true,
          },
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        current = await this.findForHunter(missionId, hunterAddress);
        if (!current) throw err;
      }
    }

    let status = current.status;
    if (chainStatus !== current.status) {
      if (canTransition(current.status, chainStatus, 'chain')) {
        status = chainStatus;
      } else if (chainStatus !== SubmissionStatus.PENDING) {
        this.logger.warn(
          `Ignoring on-chain status ${chainStatus} for submission ${current.id}: ` +
            `${current.status} -> ${chainStatus} is not a chain transition`,
        );
      }
    }

    return this.prisma.submission.update({
      where: { id: current.id },
      data: { ipfsCid, status, chainConfirmed: true },
    });
  }

  private findForHunter(
    missionId: string,
    hunterAddress: string,
  ): Promise<Submission | null> {
    return this.prisma.submission.findUnique({
      where: { missionId_hunterAddress: { missionId, hunterAddress } },
    });
  }

  /**
   * One submission per (mission, hunter), as on chain (`AlreadySubmitted`).
   * A retry of the same write returns the existing row; anything else is 409.
   */
  private resolveDuplicate(
    existing: Submission,
    ipfsCid: string,
    txHash: string,
  ): Submission {
    const sameWrite =
      existing.ipfsCid === ipfsCid &&
      (existing.txHash === txHash ||
        (existing.txHash === null && existing.chainConfirmed));
    if (sameWrite) return existing;

    throw new ConflictException(
      'A submission for this mission already exists for this hunter',
    );
  }
}
