import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  MissionStatus,
  Prisma,
  Submission,
  SubmissionStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SubmissionSyncService } from './submission-sync.service';

const MISSION = 'mission-1';
const HUNTER = 'GHUNTER';
const CID = 'QmSubmissionCid';
const TX = 'a'.repeat(64);

function row(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 'sub-1',
    missionId: MISSION,
    hunterAddress: HUNTER,
    ipfsCid: CID,
    textPayload: null,
    sentiment: null,
    status: SubmissionStatus.PENDING,
    rejectionReason: null,
    txHash: TX,
    chainConfirmed: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('SubmissionSyncService', () => {
  let service: SubmissionSyncService;
  let prisma: {
    mission: { findUnique: jest.Mock };
    submission: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      mission: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: MISSION, status: MissionStatus.OPEN }),
      },
      submission: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn((args: { data: Partial<Submission> }) =>
          Promise.resolve(row(args.data)),
        ),
        update: jest.fn(
          (args: { where: { id: string }; data: Partial<Submission> }) =>
            Promise.resolve(row({ id: args.where.id, ...args.data })),
        ),
      },
    };
    service = new SubmissionSyncService(prisma as unknown as PrismaService);
  });

  describe('recordSubmission (optimistic API write)', () => {
    it('creates a PENDING, unconfirmed row keyed on (mission, hunter)', async () => {
      const result = await service.recordSubmission(MISSION, HUNTER, {
        ipfsCid: CID,
        txHash: TX,
      });

      expect(prisma.submission.findUnique).toHaveBeenCalledWith({
        where: {
          missionId_hunterAddress: {
            missionId: MISSION,
            hunterAddress: HUNTER,
          },
        },
      });
      expect(prisma.submission.create).toHaveBeenCalledWith({
        data: {
          missionId: MISSION,
          hunterAddress: HUNTER,
          ipfsCid: CID,
          txHash: TX,
          status: SubmissionStatus.PENDING,
          chainConfirmed: false,
        },
      });
      expect(result.status).toBe(SubmissionStatus.PENDING);
    });

    it('normalises the tx hash to lowercase and trims the CID', async () => {
      await service.recordSubmission(MISSION, HUNTER, {
        ipfsCid: `  ${CID} `,
        txHash: 'A'.repeat(64),
      });
      expect(prisma.submission.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ipfsCid: CID, txHash: TX }),
      });
    });

    it('404s for an unknown mission', async () => {
      prisma.mission.findUnique.mockResolvedValue(null);
      await expect(
        service.recordSubmission(MISSION, HUNTER, { ipfsCid: CID, txHash: TX }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.submission.create).not.toHaveBeenCalled();
    });

    it.each([
      MissionStatus.PAUSED,
      MissionStatus.COMPLETED,
      MissionStatus.CANCELLED,
    ])('409s when the mission is %s (chain MissionNotOpen)', async (status) => {
      prisma.mission.findUnique.mockResolvedValue({ id: MISSION, status });
      await expect(
        service.recordSubmission(MISSION, HUNTER, { ipfsCid: CID, txHash: TX }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.submission.create).not.toHaveBeenCalled();
    });

    it('accepts submissions while the mission is STARTED', async () => {
      prisma.mission.findUnique.mockResolvedValue({
        id: MISSION,
        status: MissionStatus.STARTED,
      });
      await expect(
        service.recordSubmission(MISSION, HUNTER, { ipfsCid: CID, txHash: TX }),
      ).resolves.toMatchObject({ status: SubmissionStatus.PENDING });
    });

    it('is idempotent: retrying the same write returns the existing row', async () => {
      const existing = row({ status: SubmissionStatus.APPROVED });
      prisma.submission.findUnique.mockResolvedValue(existing);
      prisma.mission.findUnique.mockResolvedValue({
        id: MISSION,
        status: MissionStatus.PAUSED,
      });

      await expect(
        service.recordSubmission(MISSION, HUNTER, { ipfsCid: CID, txHash: TX }),
      ).resolves.toBe(existing);
      expect(prisma.submission.create).not.toHaveBeenCalled();
    });

    it('returns an indexer-confirmed row when the CID matches', async () => {
      const confirmed = row({ txHash: null, chainConfirmed: true });
      prisma.submission.findUnique.mockResolvedValue(confirmed);
      await expect(
        service.recordSubmission(MISSION, HUNTER, { ipfsCid: CID, txHash: TX }),
      ).resolves.toBe(confirmed);
    });

    it.each([
      ['a different tx hash', { ipfsCid: CID, txHash: 'b'.repeat(64) }],
      ['a different CID', { ipfsCid: 'QmOther', txHash: TX }],
    ])('409s on a second submission with %s', async (_label, dto) => {
      prisma.submission.findUnique.mockResolvedValue(row());
      await expect(
        service.recordSubmission(MISSION, HUNTER, dto),
      ).rejects.toThrow('already exists for this hunter');
    });

    it('resolves a concurrent-write race against the winning row', async () => {
      prisma.submission.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(row());
      prisma.submission.create.mockRejectedValue(uniqueViolation());

      await expect(
        service.recordSubmission(MISSION, HUNTER, { ipfsCid: CID, txHash: TX }),
      ).resolves.toMatchObject({ id: 'sub-1' });
    });

    it('409s when the tx hash belongs to another submission', async () => {
      prisma.submission.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.recordSubmission(MISSION, HUNTER, { ipfsCid: CID, txHash: TX }),
      ).rejects.toThrow('already linked to another submission');
    });

    it('rethrows unexpected database errors', async () => {
      prisma.submission.create.mockRejectedValue(new Error('connection lost'));
      await expect(
        service.recordSubmission(MISSION, HUNTER, { ipfsCid: CID, txHash: TX }),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('applyChainSubmission (indexer, source of truth)', () => {
    it('creates a confirmed row when the indexer sees a new submission', async () => {
      await service.applyChainSubmission({
        missionId: MISSION,
        hunterAddress: HUNTER,
        ipfsCid: CID,
        status: 'Pending',
      });
      expect(prisma.submission.create).toHaveBeenCalledWith({
        data: {
          missionId: MISSION,
          hunterAddress: HUNTER,
          ipfsCid: CID,
          status: SubmissionStatus.PENDING,
          chainConfirmed: true,
        },
      });
    });

    it('confirms an optimistic row and takes the CID from the chain', async () => {
      prisma.submission.findUnique.mockResolvedValue(
        row({ ipfsCid: 'QmClientSide' }),
      );
      await service.applyChainSubmission({
        missionId: MISSION,
        hunterAddress: HUNTER,
        ipfsCid: CID,
        status: 0,
      });
      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          ipfsCid: CID,
          status: SubmissionStatus.PENDING,
          chainConfirmed: true,
        },
      });
    });

    it.each([
      SubmissionStatus.PENDING,
      SubmissionStatus.APPROVED,
      SubmissionStatus.REJECTED,
    ])('moves %s to PAID when the chain reports a payout', async (from) => {
      prisma.submission.findUnique.mockResolvedValue(row({ status: from }));
      await service.applyChainSubmission({
        missionId: MISSION,
        hunterAddress: HUNTER,
        ipfsCid: CID,
        status: 'Paid',
      });
      expect(prisma.submission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SubmissionStatus.PAID }),
        }),
      );
    });

    it("keeps the owner's off-chain review when the chain still says Pending", async () => {
      prisma.submission.findUnique.mockResolvedValue(
        row({ status: SubmissionStatus.APPROVED }),
      );
      await service.applyChainSubmission({
        missionId: MISSION,
        hunterAddress: HUNTER,
        ipfsCid: CID,
        status: 'Pending',
      });
      expect(prisma.submission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SubmissionStatus.APPROVED }),
        }),
      );
    });

    it('never moves a PAID row backwards', async () => {
      prisma.submission.findUnique.mockResolvedValue(
        row({ status: SubmissionStatus.PAID }),
      );
      await service.applyChainSubmission({
        missionId: MISSION,
        hunterAddress: HUNTER,
        ipfsCid: CID,
        status: 'Rejected',
      });
      expect(prisma.submission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SubmissionStatus.PAID }),
        }),
      );
    });

    it('replaying the same chain state is a no-op on status', async () => {
      prisma.submission.findUnique.mockResolvedValue(
        row({ status: SubmissionStatus.PAID, chainConfirmed: true }),
      );
      await service.applyChainSubmission({
        missionId: MISSION,
        hunterAddress: HUNTER,
        ipfsCid: CID,
        status: 2,
      });
      expect(prisma.submission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SubmissionStatus.PAID }),
        }),
      );
    });

    it('reconciles with the API row that won a create race', async () => {
      prisma.submission.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(row());
      prisma.submission.create.mockRejectedValue(uniqueViolation());

      await service.applyChainSubmission({
        missionId: MISSION,
        hunterAddress: HUNTER,
        ipfsCid: CID,
        status: 'Pending',
      });
      expect(prisma.submission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ chainConfirmed: true }),
        }),
      );
    });

    it('rejects an unknown chain status before touching the database', async () => {
      await expect(
        service.applyChainSubmission({
          missionId: MISSION,
          hunterAddress: HUNTER,
          ipfsCid: CID,
          status: 9,
        }),
      ).rejects.toThrow('Unknown on-chain submission status');
      expect(prisma.submission.findUnique).not.toHaveBeenCalled();
    });
  });
});
