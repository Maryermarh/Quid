import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Hunter-scoped reads. Issue #327: backs the "My Submissions" screen with real
 * submission records instead of the placeholder route.
 */
@Injectable()
export class HunterService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * All submissions submitted by this hunter, newest first, with enough of the
   * mission attached for the UI to render a status list that links back to the
   * quest (title, reward, current mission state).
   */
  async getMySubmissions(hunterAddress: string): Promise<unknown> {
    return this.prisma.submission.findMany({
      where: { hunterAddress },
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
  }
}
