import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateSubmissionDto {
  /** IPFS CID passed to `submit_feedback` (CIDv0 base58 or CIDv1 base32). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'ipfsCid must be an IPFS CID (letters and digits only)',
  })
  ipfsCid!: string;

  /** Hash of the confirmed `submit_feedback` transaction (64 hex chars). */
  @IsString()
  @Matches(/^[0-9a-fA-F]{64}$/, {
    message: 'txHash must be a 64-character hex Stellar transaction hash',
  })
  txHash!: string;
}
