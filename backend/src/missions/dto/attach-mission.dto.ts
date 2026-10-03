import { IsString, Matches } from 'class-validator';

export class AttachMissionDto {
  @IsString()
  @Matches(/^\d+$/)
  onChainId: string = '';
}
