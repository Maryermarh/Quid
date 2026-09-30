import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Matches,
  Min,
} from 'class-validator';
import { Prisma } from '@prisma/client';

export class PublishDraftDto {
  @IsString()
  @Matches(/^\d+$/)
  onChainId: string = '';

  @IsString()
  @IsNotEmpty()
  descriptionCid: string = '';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  metadataCid?: string;

  @IsOptional()
  @IsObject()
  metadata?: Prisma.InputJsonValue;

  @IsString()
  @IsNotEmpty()
  rewardToken: string = '';

  @IsString()
  @Matches(/^[1-9]\d{0,38}$/)
  rewardAmount: string = '';

  @IsInt()
  @Min(0)
  @Max(4294967295)
  maxParticipants: number = 0;

  @IsOptional()
  @IsString()
  aiSummary?: string;
}
