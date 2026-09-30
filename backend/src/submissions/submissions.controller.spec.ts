import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { CreateSubmissionDto } from './dto/create-submission.dto';
import { SubmissionSyncService } from './submission-sync.service';
import { SubmissionsController } from './submissions.controller';

describe('SubmissionsController', () => {
  it('always records the submission for the authenticated wallet', async () => {
    const recordSubmission = jest.fn().mockResolvedValue({ id: 'sub-1' });
    const controller = new SubmissionsController({
      recordSubmission,
    } as unknown as SubmissionSyncService);
    const dto = { ipfsCid: 'QmCid', txHash: 'a'.repeat(64) };

    await controller.create('mission-1', dto, {
      user: { userId: 'u1', address: 'GHUNTER' },
    } as never);

    expect(recordSubmission).toHaveBeenCalledWith('mission-1', 'GHUNTER', dto);
  });
});

describe('CreateSubmissionDto validation', () => {
  // Same options as the global pipe in main.ts.
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });
  const validate = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: CreateSubmissionDto });

  it('accepts a CID and a 64-char hex hash', async () => {
    await expect(
      validate({ ipfsCid: 'bafybeigdyrzt5', txHash: 'AbC0'.repeat(16) }),
    ).resolves.toBeInstanceOf(CreateSubmissionDto);
  });

  it.each([
    ['a missing tx hash', { ipfsCid: 'QmCid' }],
    ['a short tx hash', { ipfsCid: 'QmCid', txHash: 'a'.repeat(63) }],
    ['a non-hex tx hash', { ipfsCid: 'QmCid', txHash: 'g'.repeat(64) }],
    ['an empty CID', { ipfsCid: '', txHash: 'a'.repeat(64) }],
    ['a CID with a path', { ipfsCid: 'Qm/../etc', txHash: 'a'.repeat(64) }],
    ['an over-long CID', { ipfsCid: 'Q'.repeat(129), txHash: 'a'.repeat(64) }],
    [
      'a hunter address in the body',
      { ipfsCid: 'QmCid', txHash: 'a'.repeat(64), hunterAddress: 'GOTHER' },
    ],
  ])('rejects %s', async (_label, body) => {
    await expect(validate(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
