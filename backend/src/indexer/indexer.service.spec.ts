import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { rpc, xdr } from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { IndexerService } from './indexer.service';

describe('IndexerService', () => {
  const event: rpc.Api.EventResponse = {
    id: '100-0',
    type: 'contract',
    ledger: 100,
    ledgerClosedAt: '2026-09-29T12:00:00Z',
    pagingToken: '100-0',
    inSuccessfulContractCall: true,
    txHash: 'transaction',
    topic: [xdr.ScVal.scvSymbol('mission'), xdr.ScVal.scvSymbol('create')],
    value: xdr.ScVal.scvVoid(),
  };

  let service: IndexerService;
  let prisma: {
    indexerState: { upsert: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let transaction: { indexerState: { upsert: jest.Mock } };
  let getEvents: jest.SpyInstance;
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    transaction = {
      indexerState: { upsert: jest.fn() },
    };
    prisma = {
      indexerState: {
        upsert: jest.fn().mockResolvedValue({
          id: 1,
          lastLedger: BigInt(0),
          lastCursor: null,
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn(
        (callback: (tx: typeof transaction) => Promise<void>) =>
          callback(transaction),
      ),
    };
    service = new IndexerService(
      {
        get: jest.fn().mockImplementation(
          (key: string) =>
            ({
              RPC_URL: 'https://rpc.example',
              CONTRACT_ID: 'C123',
            })[key],
        ),
      } as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
    getEvents = jest
      .spyOn(rpc.Server.prototype, 'getEvents')
      .mockResolvedValue({
        latestLedger: 100,
        events: [event],
        cursor: '100-0',
      });
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    getEvents.mockRestore();
    errorLog.mockRestore();
  });

  it('does not advance the persisted cursor when event processing fails', async () => {
    await expect(service.pollEvents()).rejects.toThrow(
      'Unexpected Soroban event payload encoding',
    );

    expect(prisma.indexerState.upsert).toHaveBeenCalledTimes(1);
    expect(transaction.indexerState.upsert).not.toHaveBeenCalled();
    expect(prisma.indexerState.update).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      'Soroban event sync failed: Unexpected Soroban event payload encoding',
      expect.any(String),
    );
  });
});
