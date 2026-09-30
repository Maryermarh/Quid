/**
 * E2E Happy Path: Founder → Hunter → Payout
 * Issue #343
 *
 * These unit tests exercise the MissionsService in the sequence a real
 * founder-hunter-payout flow would follow:
 *
 *   1. Founder lists open missions (mission discovery)
 *   2. Hunter views a mission
 *   3. Creator reads the submission list before the hunter submits (empty)
 *   4. After the hunter submits (simulated), creator reads the list (one entry)
 *   5. Creator approves the submission → status APPROVED
 *   6. Verifying a double-approval is rejected (ConflictException)
 */

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SubmissionStatus, MissionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MissionsService } from './missions.service';

const FOUNDER_ADDRESS =
  'GFOUNDER111111111111111111111111111111111111111111111111';
const HUNTER_ADDRESS =
  'GHUNTER1111111111111111111111111111111111111111111111111';
const MISSION_ID = 'mission-happy-path-1';
const SUBMISSION_ID = 'submission-happy-path-1';

const baseMission = {
  id: MISSION_ID,
  ownerAddress: FOUNDER_ADDRESS,
  title: 'Test the Ruze.stellar dApp',
  descriptionCid: 'bafkreiabc123',
  metadataCid: 'bafkreiabc456',
  metadata: {},
  rewardToken: 'XLM',
  rewardAmount: '100',
  maxParticipants: 5,
  participantsCount: 0,
  status: MissionStatus.OPEN,
  aiSummary: 'Test the dApp and submit detailed feedback.',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  owner: { address: FOUNDER_ADDRESS, displayName: 'Ruze Team' },
  _count: { submissions: 0 },
};

const pendingSubmission = {
  id: SUBMISSION_ID,
  missionId: MISSION_ID,
  hunterAddress: HUNTER_ADDRESS,
  ipfsCid: 'bafkreifeedback123',
  textPayload: 'Great dApp, found 2 bugs in the onboarding flow.',
  sentiment: 0.8,
  status: SubmissionStatus.PENDING,
  rejectionReason: null,
  createdAt: new Date('2026-01-02T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  hunter: { address: HUNTER_ADDRESS, displayName: 'Alice Hunter' },
};

describe('E2E Happy Path – Founder → Hunter → Payout (Issue #343)', () => {
  let service: MissionsService;
  let notifications: {
    notifySubmissionPaid: jest.Mock;
    notifySubmissionRejected: jest.Mock;
  };
  let prisma: {
    mission: { findMany: jest.Mock; findUnique: jest.Mock };
    submission: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    missionDraft: {
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      mission: { findMany: jest.fn(), findUnique: jest.fn() },
      submission: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      missionDraft: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    notifications = {
      notifySubmissionPaid: jest.fn().mockResolvedValue(null),
      notifySubmissionRejected: jest.fn().mockResolvedValue(null),
    };
    service = new MissionsService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  // -------------------------------------------------------------------------
  // Step 1: Mission discovery
  // -------------------------------------------------------------------------
  describe('Step 1 – Mission discovery', () => {
    it('founder can list OPEN missions (mission is visible to hunters)', async () => {
      prisma.mission.findMany.mockResolvedValue([baseMission]);

      const result = (await service.listPublicMissions({
        status: 'OPEN',
      })) as (typeof baseMission)[];

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(MISSION_ID);
      expect(result[0].status).toBe(MissionStatus.OPEN);
    });
  });

  // -------------------------------------------------------------------------
  // Step 2: Hunter views mission
  // -------------------------------------------------------------------------
  describe('Step 2 – Hunter views mission detail', () => {
    it('hunter can fetch a single mission by ID', async () => {
      prisma.mission.findUnique.mockResolvedValue({
        ...baseMission,
        owner: {
          address: FOUNDER_ADDRESS,
          displayName: 'Ruze Team',
          email: 'ruze@example.com',
        },
      });

      const result = (await service.getMission(
        MISSION_ID,
      )) as typeof baseMission;

      expect(result.id).toBe(MISSION_ID);
      expect(result.status).toBe(MissionStatus.OPEN);
    });

    it('returns NotFoundException for a nonexistent mission ID', async () => {
      prisma.mission.findUnique.mockResolvedValue(null);

      await expect(service.getMission('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Step 3: Submission list is empty before hunter submits
  // -------------------------------------------------------------------------
  describe('Step 3 – Submissions list (before hunter submits)', () => {
    it('founder sees an empty submission list before any hunter submits', async () => {
      prisma.mission.findUnique.mockResolvedValue({
        id: MISSION_ID,
        ownerAddress: FOUNDER_ADDRESS,
      });
      prisma.submission.findMany.mockResolvedValue([]);

      const result = (await service.getMissionSubmissions(
        MISSION_ID,
        FOUNDER_ADDRESS,
      )) as unknown[];

      expect(result).toHaveLength(0);
    });

    it('non-owner cannot view the submissions list', async () => {
      prisma.mission.findUnique.mockResolvedValue({
        id: MISSION_ID,
        ownerAddress: FOUNDER_ADDRESS,
      });

      await expect(
        service.getMissionSubmissions(MISSION_ID, HUNTER_ADDRESS),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // Step 4: Submission list reflects hunter's entry after on-chain submit
  // -------------------------------------------------------------------------
  describe('Step 4 – Submission list (after hunter submits via Soroban)', () => {
    it('founder sees the hunter submission with PENDING status', async () => {
      prisma.mission.findUnique.mockResolvedValue({
        id: MISSION_ID,
        ownerAddress: FOUNDER_ADDRESS,
      });
      prisma.submission.findMany.mockResolvedValue([pendingSubmission]);

      const result = (await service.getMissionSubmissions(
        MISSION_ID,
        FOUNDER_ADDRESS,
      )) as (typeof pendingSubmission)[];

      expect(result).toHaveLength(1);
      expect(result[0].hunterAddress).toBe(HUNTER_ADDRESS);
      expect(result[0].status).toBe(SubmissionStatus.PENDING);
      expect(result[0].ipfsCid).toBe('bafkreifeedback123');
    });
  });

  // -------------------------------------------------------------------------
  // Step 5: Founder approves → payout
  // -------------------------------------------------------------------------
  describe('Step 5 – Founder approves submission (payout)', () => {
    beforeEach(() => {
      prisma.mission.findUnique.mockResolvedValue({
        ownerAddress: FOUNDER_ADDRESS,
      });
      prisma.submission.findUnique
        .mockResolvedValueOnce({
          id: SUBMISSION_ID,
          missionId: MISSION_ID,
          status: SubmissionStatus.PENDING,
        })
        .mockResolvedValueOnce({
          id: SUBMISSION_ID,
          missionId: MISSION_ID,
          status: SubmissionStatus.APPROVED,
        });
      prisma.submission.updateMany.mockResolvedValue({ count: 1 });
    });

    it('approves the submission and transitions status to APPROVED', async () => {
      const result = (await service.approveSubmission(
        MISSION_ID,
        SUBMISSION_ID,
        FOUNDER_ADDRESS,
      )) as { id: string; status: string };

      expect(prisma.submission.updateMany).toHaveBeenCalledWith({
        where: {
          id: SUBMISSION_ID,
          missionId: MISSION_ID,
          status: SubmissionStatus.PENDING,
        },
        data: {
          status: SubmissionStatus.APPROVED,
          rejectionReason: null,
        },
      });
      expect(result.status).toBe(SubmissionStatus.APPROVED);
    });

    it('returns 403 if a non-owner attempts to approve', async () => {
      await expect(
        service.approveSubmission(MISSION_ID, SUBMISSION_ID, HUNTER_ADDRESS),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.submission.updateMany).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Step 6: Double-approval guard
  // -------------------------------------------------------------------------
  describe('Step 6 – Double-approval prevention', () => {
    it('rejects a second approval attempt with ConflictException', async () => {
      prisma.mission.findUnique.mockResolvedValue({
        ownerAddress: FOUNDER_ADDRESS,
      });
      // Submission is already APPROVED (terminal state)
      prisma.submission.findUnique.mockResolvedValue({
        id: SUBMISSION_ID,
        missionId: MISSION_ID,
        status: SubmissionStatus.APPROVED,
      });

      await expect(
        service.approveSubmission(MISSION_ID, SUBMISSION_ID, FOUNDER_ADDRESS),
      ).rejects.toThrow(ConflictException);
      expect(prisma.submission.updateMany).not.toHaveBeenCalled();
    });
  });
});
