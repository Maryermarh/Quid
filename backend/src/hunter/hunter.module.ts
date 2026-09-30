import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HunterController } from './hunter.controller';
import { HunterService } from './hunter.service';

@Module({
  imports: [PrismaModule],
  controllers: [HunterController],
  providers: [HunterService],
})
export class HunterModule {}