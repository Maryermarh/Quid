import { PrismaService } from '../prisma/prisma.service';
import { MissionStatus, SubmissionStatus } from '@prisma/client';
import { HunterService } from './hunter.service';

const sampleSubmission = {
  id: 'submission-1',
  missionId: 'mission-1',
  hunterAddress: 'GHUNTER1111111111111111111111111111111111111111111111111',
  ipfsCid: 'bafkreihash2zicv5xmpfpbhzdn62d5zi3q',
  textPayload: 'Great product, loved the onboarding.',
  sentiment: 0.8,
  status: SubmissionStatus.PENDING,
  rejectionReason: null,
  createdAt: new Date('2026-09-01T10:00:00Z'),
  updatedAt: new Date('2026-09-01T10:00:00Z'),
  mission: {
    id: 'mission-1',
    title: 'Test the Ruze.stellar onboarding',
    status: MissionStatus.OPEN,
    rewardToken: 'XLM',
    rewardAmount: '640',
    ownerAddress: 'GFOUNDER111111111111111111111111111111111111111111111111',
  },
};

describe('HunterService', () => {
  let service: HunterService;
  let prisma: {
    submission: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      submission: { findMany: jest.fn() },
    };

    service = new HunterService(prisma as unknown as PrismaService);
  });

  it('returns the hunter submissions newest first with their missions', async () => {
    prisma.submission.findMany.mockResolvedValue([
      sampleSubmission,
      {
        ...sampleSubmission,
        id: 'submission-2',
        missionId: 'mission-2',
        status: SubmissionStatus.PAID,
        mission: {
          ...sampleSubmission.mission,
          id: 'mission-2',
          title: 'Review the Mizu wallet flow',
          status: MissionStatus.OPEN,
        },
      },
    ]);

    const result = (await service.getMySubmissions(
      'GHUNTER1111111111111111111111111111111111111111111111111',
    )) as (typeof sampleSubmission)[];

    expect(prisma.submission.findMany).toHaveBeenCalledWith({
      where: {
        hunterAddress: 'GHUNTER1111111111111111111111111111111111111111111111111',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        mission: {
          select: {
            id: true,
            title: true,
            status: true,
            rewardToken: true,
            rewardAmount: true,
            ownerAddress: true,
          },
        },
      },
    });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('submission-1');
    expect(result[0].mission.title).toBe('Test the Ruze.stellar onboarding');
    expect(result[1].status).toBe(SubmissionStatus.PAID);
  });

  it('returns an empty array when the hunter has no submissions', async () => {
    prisma.submission.findMany.mockResolvedValue([]);

    const result = await service.getMySubmissions('GHUNTER...');

    expect(result).toEqual([]);
  });
});