import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttachMissionDto } from './dto/attach-mission.dto';
import { PublishDraftDto } from './dto/publish-draft.dto';
import { MissionsService } from './missions.service';

describe('MissionsService publish and attach', () => {
  const ownerAddress = 'GOWNER';
  const dto: PublishDraftDto = {
    onChainId: '42',
    descriptionCid: 'bafydescription',
    rewardToken: 'CTOKEN',
    rewardAmount: '100',
    maxParticipants: 5,
  };
  let service: MissionsService;
  let tx: {
    missionDraft: { findUnique: jest.Mock; updateMany: jest.Mock };
    mission: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let prisma: {
    $transaction: jest.Mock;
    mission: { findUnique: jest.Mock; update: jest.Mock };
  };

  beforeEach(() => {
    tx = {
      missionDraft: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mission: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    prisma = {
      $transaction: jest.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
      mission: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new MissionsService(prisma as unknown as PrismaService);
  });

  it('publishes an owned draft and stores its on-chain link atomically', async () => {
    tx.missionDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      ownerAddress,
      title: 'Published mission',
      publishedMissionId: null,
    });
    tx.mission.findUnique.mockResolvedValue(null);
    tx.mission.create.mockResolvedValue({
      id: 'mission-1',
      ownerAddress,
      title: 'Published mission',
      onChainId: '42',
    });

    await expect(
      service.publishDraft('draft-1', ownerAddress, dto),
    ).resolves.toMatchObject({ id: 'mission-1', onChainId: '42' });

    expect(tx.mission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerAddress,
        title: 'Published mission',
        onChainId: '42',
        metadataCid: 'bafydescription',
        metadata: {},
      }),
    });
    expect(tx.missionDraft.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', publishedMissionId: null },
      data: {
        publishedAt: expect.any(Date),
        publishedMissionId: 'mission-1',
      },
    });
  });

  it('rejects publishing another user’s draft', async () => {
    tx.missionDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      ownerAddress: 'GOTHER',
      publishedMissionId: null,
    });

    await expect(
      service.publishDraft('draft-1', ownerAddress, dto),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.mission.create).not.toHaveBeenCalled();
  });

  it('rejects reusing an already attached on-chain mission ID', async () => {
    tx.missionDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      ownerAddress,
      title: 'Published mission',
      publishedMissionId: null,
    });
    tx.mission.findUnique.mockResolvedValue({
      id: 'mission-existing',
      ownerAddress,
      indexedFromChain: false,
    });

    await expect(
      service.publishDraft('draft-1', ownerAddress, dto),
    ).rejects.toThrow(ConflictException);
    expect(tx.mission.create).not.toHaveBeenCalled();
  });

  it('allows an authenticated owner to attach a unique chain ID', async () => {
    prisma.mission.findUnique
      .mockResolvedValueOnce({
        id: 'mission-1',
        ownerAddress,
        onChainId: null,
      })
      .mockResolvedValueOnce(null);
    prisma.mission.update.mockResolvedValue({
      id: 'mission-1',
      onChainId: '42',
    });
    const attachDto: AttachMissionDto = { onChainId: '42' };

    await expect(
      service.attachMission('mission-1', ownerAddress, attachDto),
    ).resolves.toMatchObject({ onChainId: '42' });
    expect(prisma.mission.update).toHaveBeenCalledWith({
      where: { id: 'mission-1' },
      data: { onChainId: '42' },
    });
  });
});
