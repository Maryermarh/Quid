# Quid Backend

NestJS API that supports Quid off-chain: wallet auth (SEP-10), mission indexing/drafts, file upload (IPFS — planned), and a Soroban event indexer (scaffold).

## Why this exists

Smart contracts hold escrow and truth for payouts. The backend makes the product usable:

- Fast mission list / search / filter (Postgres)
- Draft missions before on-chain publish
- Pin feedback media to IPFS and return CIDs
- Sync on-chain events into the DB for dashboards

The frontend should call this API for browse/auth/upload; Freighter should call contracts for create / submit / pay.

## Stack

- NestJS 11 + TypeScript
- Prisma 7 + PostgreSQL 15
- Passport JWT + Stellar SDK (SEP-10)
- `@nestjs/schedule` (indexer cron)

## What’s working

| Feature | Status |
|---------|--------|
| `GET /health` | Live |
| SEP-10 challenge + verify → JWT | Live |
| Mission list / detail / `me` / submissions (read) | Live |
| Mission drafts (`POST /missions/drafts`) | Live |
| Draft publish / on-chain mission attachment | Live |
| Upload endpoints | Stub (acks bytes/JSON only — no IPFS) |
| Chain indexer cron | Live (quid-store create, submit, payout, cancel, and pause events) |

## What’s missing (MVP gaps)

- Real IPFS / Pinata (or similar) pinning → return CID
- Create submission / approve / reject API flows synced with chain
- Hardening: rate limits, locked-down CORS, production secrets
- Frontend not wired to this API yet

## Setup

### Prerequisites

- Node.js 18+
- Docker (Postgres)

### Database

```bash
cd backend
docker compose up -d
```

Starts Postgres on `localhost:5432` (`quid` / `quid` / `quid_dev`).

### Env

```bash
cp .env.example .env
```

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string |
| `PORT` | API port (default `3001` in `.env.example`) |
| `JWT_SECRET` | JWT signing secret |
| `STELLAR_SERVER_SECRET` | Server keypair secret for SEP-10 |
| `HOME_DOMAIN` / `WEB_AUTH_DOMAIN` | SEP-10 domains |
| `STELLAR_NETWORK` | Network passphrase (testnet by default) |
| `RPC_URL` / `CONTRACT_ID` | Soroban RPC endpoint and `quid-store` contract ID for event indexing |

Generate a Stellar keypair for `STELLAR_SERVER_SECRET` (keep it server-side only).

### Install & run

```bash
npm install
npm run prisma:migrate
npm run start:dev
```

API: [http://localhost:3001](http://localhost:3001)

## HTTP surface

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `GET` | `/health` | No | Health check |
| `GET` | `/auth/challenge?address=` | No | SEP-10 challenge |
| `POST` | `/auth/verify` | No | Returns JWT |
| `GET` | `/missions` | No | List / filter |
| `GET` | `/missions/me` | JWT | Caller’s missions |
| `GET` | `/missions/:id` | No | Detail |
| `GET` | `/missions/:id/submissions` | JWT | Owner only |
| `POST` | `/missions/drafts` | JWT | Save draft |
| `POST` | `/missions/drafts/:draftId/publish` | JWT | Publish an owned draft after on-chain creation; creates or enriches the linked mission |
| `POST` | `/missions/:id/attach` | JWT | Attach an on-chain mission ID to an owned mission |
| `POST` | `/upload` | JWT | Stub |
| `POST` | `/upload/json` | JWT | Stub |

### Draft publishing

After `create_mission` succeeds in Freighter, publish the authenticated user's
saved draft with `POST /missions/drafts/:draftId/publish`. The body includes the
chain ID and the mission values needed to enrich the indexed record:

```json
{
  "onChainId": "42",
  "descriptionCid": "bafy...",
  "metadataCid": "bafy...",
  "metadata": {},
  "rewardToken": "C...",
  "rewardAmount": "100",
  "maxParticipants": 5
}
```

The API takes the owner address from the JWT, rejects a draft owned by someone
else, and links the draft and mission in one database transaction. The separate
`POST /missions/:id/attach` endpoint links an existing owned mission. The
`onChainId` column is unique, and published drafts are excluded from later draft
edits.

## Scripts

```bash
npm run start:dev       # watch mode
npm run build
npm run start:prod
npm run test
npm run test:e2e
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

## Project layout

```text
backend/
├── docker-compose.yml
├── prisma/                 # schema + migrations
└── src/
    ├── auth/               # SEP-10 + JWT
    ├── missions/
    ├── upload/             # stub
    ├── indexer/            # scaffold
    └── prisma/
```

## Related docs

- Root: [../README.md](../README.md)
- Frontend: [../frontend/README.md](../frontend/README.md)
- Contracts: [../quid-contract/README.md](../quid-contract/README.md)
