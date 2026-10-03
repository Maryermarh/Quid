/**
 * Issue #314: a delivery channel is any transport that can put a mission
 * lifecycle alert in front of a hunter.
 *
 * Channels are deliberately dependency-free: the MVP ships an in-app channel
 * (always available, backed by the `notifications` table) and an outbound
 * webhook. Adding email later means writing one more implementation of this
 * interface, not touching the indexer.
 */
/**
 * Channel names double as the persisted `NotificationChannelName` enum, so they
 * must stay in step with `prisma/schema.prisma`.
 */
export const NOTIFICATION_CHANNELS = ['IN_APP', 'WEBHOOK'] as const;

export type NotificationChannelName = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationEnvelope {
  notificationId: string;
  recipientAddress: string;
  recipientEmail: string | null;
  type: 'SUBMISSION_PAID' | 'SUBMISSION_REJECTED';
  subject: string;
  body: string;
  missionId: string | null;
  submissionId: string | null;
  rejectionReason: string | null;
  rewardAmount: string | null;
  rewardToken: string | null;
}

/**
 * A channel reports failure by throwing. The dispatcher catches per-channel
 * errors, records the attempt, and keeps going so one broken transport cannot
 * take down the indexer tick.
 */
export interface NotificationChannel {
  readonly name: NotificationChannelName;
  /** Whether the channel is configured and can currently accept a delivery. */
  isEnabled(): boolean;
  deliver(envelope: NotificationEnvelope): Promise<void>;
}
