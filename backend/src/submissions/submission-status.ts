import { SubmissionStatus } from '@prisma/client';

/**
 * Submission status: chain <-> database mapping and transition rules (#310).
 *
 * `quid-store` declares `SubmissionStatus` (contracts/quid-store/src/types.rs)
 * as, in order: 0 Pending, 1 Approved, 2 Paid, 3 Rejected. The Prisma enum
 * uses the same names in a different order, so values are mapped by NAME and
 * the numeric discriminant is only ever read through this table.
 */
export const CHAIN_SUBMISSION_STATUSES = [
  'Pending',
  'Approved',
  'Paid',
  'Rejected',
] as const;

export type ChainSubmissionStatus = (typeof CHAIN_SUBMISSION_STATUSES)[number];

const CHAIN_TO_DB: Record<ChainSubmissionStatus, SubmissionStatus> = {
  Pending: SubmissionStatus.PENDING,
  Approved: SubmissionStatus.APPROVED,
  Paid: SubmissionStatus.PAID,
  Rejected: SubmissionStatus.REJECTED,
};

/** Map an on-chain status (variant name or discriminant) to the Prisma enum. */
export function fromChainStatus(
  value: ChainSubmissionStatus | number,
): SubmissionStatus {
  const name =
    typeof value === 'number' ? CHAIN_SUBMISSION_STATUSES[value] : value;
  if (name === undefined || !(name in CHAIN_TO_DB)) {
    throw new Error(`Unknown on-chain submission status: ${String(value)}`);
  }
  return CHAIN_TO_DB[name];
}

/** Who is moving the status: the mission owner via the API, or the indexer. */
export type TransitionSource = 'review' | 'chain';

/**
 * Allowed status changes. Same-status moves are NOT transitions.
 *
 * - review (owner, off-chain): PENDING -> APPROVED | REJECTED.
 * - chain (indexer): the only on-chain status change is
 *   `payout_participant`, which pays a submission whose ON-CHAIN status is
 *   Pending. Off-chain review never writes to the chain, so an APPROVED or
 *   REJECTED row can still be paid, and the chain wins: -> PAID.
 * - PAID is terminal for both sources.
 */
const TRANSITIONS: Record<
  TransitionSource,
  Partial<Record<SubmissionStatus, readonly SubmissionStatus[]>>
> = {
  review: {
    [SubmissionStatus.PENDING]: [
      SubmissionStatus.APPROVED,
      SubmissionStatus.REJECTED,
    ],
  },
  chain: {
    [SubmissionStatus.PENDING]: [SubmissionStatus.PAID],
    [SubmissionStatus.APPROVED]: [SubmissionStatus.PAID],
    [SubmissionStatus.REJECTED]: [SubmissionStatus.PAID],
  },
};

export function canTransition(
  from: SubmissionStatus,
  to: SubmissionStatus,
  source: TransitionSource,
): boolean {
  return TRANSITIONS[source][from]?.includes(to) ?? false;
}
