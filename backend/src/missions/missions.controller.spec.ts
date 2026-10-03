import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';
import {
  ListMissionsQueryDto,
  MissionListSort,
} from './dto/list-missions-query.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('MissionsController', () => {
  let controller: MissionsController;

  let missionsService: {
    listPublicMissions: jest.Mock;
    getMissionSubmissions: jest.Mock;
    getMission: jest.Mock;
    approveSubmission: jest.Mock;
    rejectSubmission: jest.Mock;
    saveDraft: jest.Mock;
    getLatestDraft: jest.Mock;
    publishDraft: jest.Mock;
    attachMission: jest.Mock;
  };

  beforeEach(() => {
    missionsService = {
      listPublicMissions: jest.fn(),

      getMissionSubmissions: jest.fn(),
      getMission: jest.fn(),
      approveSubmission: jest.fn(),
      rejectSubmission: jest.fn(),
      saveDraft: jest.fn(),
      getLatestDraft: jest.fn(),
      publishDraft: jest.fn(),
      attachMission: jest.fn(),
    };

    controller = new MissionsController(
      missionsService as unknown as MissionsService,
    );
  });

  it('forwards the public list query to the service unchanged', async () => {
    const query: ListMissionsQueryDto = {
      status: 'OPEN',
      sort: MissionListSort.NEWEST,
      limit: 12,
    };

    missionsService.listPublicMissions.mockResolvedValue(['mission']);

    await expect(controller.list(query)).resolves.toEqual(['mission']);
    expect(missionsService.listPublicMissions).toHaveBeenCalledWith(query);
  });

  it('delegates submissions to the service with the authenticated user address', async () => {
    missionsService.getMissionSubmissions.mockResolvedValue(['sub']);

    const result = await controller.submissions('mission-1', {
      user: { userId: 'user-1', address: '0xabc' },
    } as any);

    expect(result).toEqual(['sub']);
    expect(missionsService.getMissionSubmissions).toHaveBeenCalledWith(
      'mission-1',
      '0xabc',
    );
  });

  it('propagates ForbiddenException when user is not the mission owner', async () => {
    missionsService.getMissionSubmissions.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      controller.submissions('mission-1', {
        user: { userId: 'user-1', address: '0xother' },
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('propagates NotFoundException when mission does not exist', async () => {
    missionsService.getMissionSubmissions.mockRejectedValue(
      new NotFoundException(),
    );

    await expect(
      controller.submissions('nonexistent', {
        user: { userId: 'user-1', address: '0xabc' },
      } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('delegates approval with the authenticated owner address', async () => {
    const approved = { id: 'sub-1', status: 'APPROVED' };
    missionsService.approveSubmission.mockResolvedValue(approved);

    await expect(
      controller.approveSubmission('mission-1', 'sub-1', {
        user: { userId: 'user-1', address: '0xabc' },
      } as any),
    ).resolves.toEqual(approved);
    expect(missionsService.approveSubmission).toHaveBeenCalledWith(
      'mission-1',
      'sub-1',
      '0xabc',
    );
  });

  it('delegates rejection with an optional reason', async () => {
    const rejected = { id: 'sub-1', status: 'REJECTED' };
    missionsService.rejectSubmission.mockResolvedValue(rejected);

    await expect(
      controller.rejectSubmission(
        'mission-1',
        'sub-1',
        { reason: 'Incomplete work' },
        { user: { userId: 'user-1', address: '0xabc' } } as any,
      ),
    ).resolves.toEqual(rejected);
    expect(missionsService.rejectSubmission).toHaveBeenCalledWith(
      'mission-1',
      'sub-1',
      '0xabc',
      'Incomplete work',
    );
  });

  it('forwards the mission id to the service and returns the result', async () => {
    const mockMission = { id: 'mission-1', title: 'Test' };
    missionsService.getMission.mockResolvedValue(mockMission);

    await expect(controller.detail('mission-1')).resolves.toEqual(mockMission);
    expect(missionsService.getMission).toHaveBeenCalledWith('mission-1');
  });

  it('delegates saveDraft to the service with the authenticated user address and dto', async () => {
    const dto: SaveDraftDto = {
      title: 'My Draft',
      data: { field: 'value' },
    };
    const mockDraft = { id: 'draft-1', ownerAddress: '0xabc', ...dto };
    missionsService.saveDraft.mockResolvedValue(mockDraft);

    const result = await controller.saveDraft(dto, {
      user: { userId: 'user-1', address: '0xabc' },
    } as any);

    expect(result).toEqual(mockDraft);
    expect(missionsService.saveDraft).toHaveBeenCalledWith('0xabc', dto);
  });

  it('returns the latest draft for the authenticated user', async () => {
    const mockDraft = {
      id: 'draft-1',
      ownerAddress: '0xabc',
      title: 'My Draft',
      data: { field: 'value' },
    };
    missionsService.getLatestDraft.mockResolvedValue(mockDraft);

    await expect(
      controller.getLatestDraft({
        user: { userId: 'user-1', address: '0xabc' },
      } as any),
    ).resolves.toEqual(mockDraft);
    expect(missionsService.getLatestDraft).toHaveBeenCalledWith('0xabc');
  });

  it('requires JWT authentication to get the latest draft', () => {
    // Reading decorator metadata requires the original prototype method.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const getLatestDraft = MissionsController.prototype.getLatestDraft;
    const guards = Reflect.getMetadata(GUARDS_METADATA, getLatestDraft);

    expect(guards).toContain(JwtAuthGuard);
  });

  it('publishes a draft for the authenticated owner', async () => {
    const dto = {
      onChainId: '42',
      descriptionCid: 'bafydescription',
      rewardToken: 'CTOKEN',
      rewardAmount: '100',
      maxParticipants: 5,
    };
    const mission = { id: 'mission-1', onChainId: '42' };
    missionsService.publishDraft.mockResolvedValue(mission);

    await expect(
      controller.publishDraft('draft-1', dto, {
        user: { userId: 'user-1', address: 'GOWNER' },
      } as any),
    ).resolves.toEqual(mission);
    expect(missionsService.publishDraft).toHaveBeenCalledWith(
      'draft-1',
      'GOWNER',
      dto,
    );
  });

  it('requires JWT authentication to publish a draft', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const publishDraft = MissionsController.prototype.publishDraft;
    const guards = Reflect.getMetadata(GUARDS_METADATA, publishDraft);

    expect(guards).toContain(JwtAuthGuard);
  });
});
