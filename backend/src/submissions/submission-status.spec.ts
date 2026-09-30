import { SubmissionStatus } from '@prisma/client';

import {
  canTransition,
  CHAIN_SUBMISSION_STATUSES,
  fromChainStatus,
} from './submission-status';

const { PENDING, APPROVED, REJECTED, PAID } = SubmissionStatus;

describe('submission status (chain enum mapping)', () => {
  it('mirrors the quid-store SubmissionStatus declaration order', () => {
    expect(CHAIN_SUBMISSION_STATUSES).toEqual([
      'Pending',
      'Approved',
      'Paid',
      'Rejected',
    ]);
  });

  it.each([
    ['Pending', PENDING],
    ['Approved', APPROVED],
    ['Paid', PAID],
    ['Rejected', REJECTED],
    [0, PENDING],
    [1, APPROVED],
    [2, PAID],
    [3, REJECTED],
  ] as const)('maps %p to %s by name, not Prisma order', (chain, db) => {
    expect(fromChainStatus(chain)).toBe(db);
  });

  it.each([4, -1, 1.5, 'Cancelled', 'pending'])(
    'rejects unknown chain status %p',
    (value) => {
      expect(() => fromChainStatus(value as never)).toThrow(
        /Unknown on-chain submission status/,
      );
    },
  );
});

describe('canTransition', () => {
  it.each([
    [PENDING, APPROVED, 'review', true],
    [PENDING, REJECTED, 'review', true],
    [PENDING, PAID, 'review', false],
    [APPROVED, REJECTED, 'review', false],
    [REJECTED, APPROVED, 'review', false],
    [APPROVED, APPROVED, 'review', false],
    [PENDING, PAID, 'chain', true],
    [APPROVED, PAID, 'chain', true],
    [REJECTED, PAID, 'chain', true],
    [PENDING, APPROVED, 'chain', false],
    [PAID, PENDING, 'chain', false],
    [PAID, REJECTED, 'review', false],
    [PAID, PAID, 'chain', false],
  ] as const)('%s -> %s via %s = %s', (from, to, source, allowed) => {
    expect(canTransition(from, to, source)).toBe(allowed);
  });
});
