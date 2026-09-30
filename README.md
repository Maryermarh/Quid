<img width="161" height="87" alt="Quid" src="https://github.com/user-attachments/assets/70d1ce77-641c-445b-911d-971a8908593d" />

# Quid

Quid is a feedback marketplace on **Stellar / Soroban**. Founders lock USDC/XLM bounties for honest dApp feedback; hunters earn rewards for useful submissions.

## The problem

- Founders struggle to find real users to test their dApps.
- Users have little incentive to write detailed, constructive feedback.
- Discord feedback is often spam or lost in noise.

## The solution

1. **Founders** create a Mission and escrow rewards in `quid-store`.
2. **Hunters** submit feedback (text / screenshots) via IPFS; only the CID goes on-chain.
3. **Payout** happens from the smart contract when the founder approves.

### Core features

| Feature | Description |
|---------|-------------|
| **Bounty Vault** | Rewards locked on-chain when a mission is created |
| **Hybrid storage** | Feedback on IPFS; CID on Soroban |
| **Asset gating** | Optional token/NFT holdings required to submit |
| **Reputation** | On-chain attestations / profiles for quality contributors |

## Repository layout

```text
Quid/
├── frontend/          # Next.js app (Freighter, creator + hunter UI)
├── backend/           # NestJS API (auth, missions index, upload, indexer)
├── quid-contract/     # Soroban contracts (store, reputation, milestone escrow, dispute)
└── CONTRIBUTING.md
```

## Architecture

```text
Freighter wallet
      │
      ▼
Frontend (Next.js) ──────► Backend (NestJS + Postgres)
      │                         │
      │ create / submit / pay   │ index events, drafts, IPFS
      ▼                         ▼
Soroban contracts ◄─────────────┘
(quid-store, quid-reputation, quid-milestone-escrow, quid-dispute)
      │
      ▼
IPFS (feedback blobs; CID stored on-chain)
```

**Current status (honest):** Contracts are implemented and deployable. Frontend has Freighter + Horizon wiring and polished UI shells, but marketplace data is still mostly mock and contract IDs are not invoked yet. Backend has SEP-10 auth, mission reads/drafts, and stubs for IPFS upload + chain indexer. The MVP gap is wiring **create → submit → approve → payout** end-to-end.

## Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | Next.js, React, TypeScript, Tailwind, shadcn/ui, Freighter, Stellar SDK |
| Backend | NestJS, Prisma, PostgreSQL, SEP-10 / JWT |
| Contracts | Rust, Soroban SDK 23, Stellar CLI |
| Payments | USDC / XLM on Stellar |

## Port & Service Map

| Service | Port | Default URL | Purpose |
|---------|------|-------------|---------|
| **Frontend** | `3000` | `http://localhost:3000` | Next.js web application |
| **Backend API** | `3001` | `http://localhost:3001` | NestJS REST API |
| **PostgreSQL** | `5432` | `localhost:5432` | Postgres database |
| **Stellar Testnet Horizon** | Remote | `https://horizon-testnet.stellar.org` | Stellar Horizon testnet endpoint |
| **Stellar Testnet RPC** | Remote | `https://soroban-testnet.stellar.org` | Soroban RPC testnet endpoint |

---

## Full-Stack Local Demo Guide

Follow this step-by-step guide to run the entire Quid stack locally in under an hour.

### 1. Prerequisites

- **Node.js**: v18 or v20+ (`node --version`)
- **Docker & Docker Compose**: For running PostgreSQL (`docker compose version`)
- **Stellar CLI**: For building and deploying Soroban contracts (`stellar --version`)
- **Freighter Wallet**: Browser extension installed ([freighter.app](https://www.freighter.app/))

---

### 2. Database Setup (PostgreSQL)

Start the local PostgreSQL container:

```bash
cd backend
docker compose up -d
```

Verify that Postgres is running on port `5432`:

```bash
docker compose ps
# DB accessible at: postgresql://quid:quid@localhost:5432/quid_dev?schema=public
```

---

### 3. Backend API Setup

Configure environment variables and start the NestJS backend on port `3001`:

```bash
cd backend

# Create environment file from template
cp .env.example .env
```

Ensure `backend/.env` contains:

```env
DATABASE_URL="postgresql://quid:quid@localhost:5432/quid_dev?schema=public"
PORT=3001
JWT_SECRET="dev-jwt-secret-key-change-in-production"
STELLAR_SERVER_SECRET="SBAY...YOUR_SERVER_SECRET_KEY"
HOME_DOMAIN="localhost"
WEB_AUTH_DOMAIN="localhost"
STELLAR_NETWORK="Test SDF Network ; September 2015"
```

> **Tip:** You can generate a random Stellar keypair for `STELLAR_SERVER_SECRET` using `stellar keys generate server-key --network testnet --as-secret`.

Install dependencies, run database migrations, and start the development server:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

Verify backend health at [http://localhost:3001/health](http://localhost:3001/health).

---

### 4. Smart Contracts & Testnet Deployment

To interact with real on-chain contracts on Stellar Testnet:

1. Generate and fund a deployer identity:
   ```bash
   stellar keys generate alice --network testnet --as-secret
   stellar keys fund alice --network testnet
   ```

2. Build and deploy contracts:
   ```bash
   cd quid-contract
   stellar contract build

   # Deploy quid-store
   STORE_ID=$(stellar contract deploy \
     --wasm target/wasm32v1-none/release/quid_store.wasm \
     --source alice \
     --network testnet)
   echo "STORE_ID: $STORE_ID"

   # Deploy quid-reputation
   REP_ID=$(stellar contract deploy \
     --wasm target/wasm32v1-none/release/quid_reputation.wasm \
     --source alice \
     --network testnet)
   echo "REP_ID: $REP_ID"

   # Deploy quid-milestone-escrow
   MILESTONE_ID=$(stellar contract deploy \
     --wasm target/wasm32v1-none/release/quid_milestone_escrow.wasm \
     --source alice \
     --network testnet)
   echo "MILESTONE_ID: $MILESTONE_ID"

   # Initialize reputation contract admin
   stellar contract invoke \
     --id $REP_ID \
     --source alice \
     --network testnet \
     -- initialize --admin alice
   ```

*(For local testing without deploying contracts, you can use the placeholder IDs provided in `frontend/.env.example`.)*

#### Reward tokens to use on testnet

When you create a mission, `reward_token` must be a **Stellar Asset Contract (SAC)
address**, not a classic `CODE:ISSUER` pair. Use these verified testnet values:

| Asset | SAC contract id (`reward_token`) | How to get testnet funds |
|-------|------------------------------------|---------------------------|
| XLM (native) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | Friendbot — `stellar keys fund <ADDRESS> --network testnet` |
| USDC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | [Circle testnet faucet](https://faucet.circle.com/), then add a trustline to issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |

Notes:

- **Native XLM is the easy path for local testing** — Friendbot funds it directly
  and it needs no trustline.
- **USDC must be the official Circle testnet asset** (issuer ending `FLA5`).
  Testnet is full of unverified lookalike `USDC` assets that deploy fine and
  then fail to settle.
- To check any SAC id before using it, call `name` on it and confirm it returns
  the asset you expect. See
  [`quid-contract/README.md`](quid-contract/README.md#reward-tokens-testnet) for
  the full table, the trustline step, and how to resolve other SAC ids.

---

### 5. Freighter Wallet Setup

1. Open the **Freighter** browser extension.
2. In Settings, ensure the network is set to **Testnet** (`Test SDF Network ; September 2015`).
3. Fund your Freighter wallet address with testnet XLM via Friendbot at [Stellar Laboratory](https://laboratory.stellar.org/#account-creator) or by running:
   ```bash
   stellar keys fund <YOUR_FREIGHTER_PUBLIC_KEY> --network testnet
   ```

---

### 6. Frontend Setup

Configure environment variables and start Next.js on port `3000`:

```bash
cd frontend

# Copy template configuration
cp .env.example .env.local
```

Edit `frontend/.env.local` to match your backend port (`3001`) and deployed contract IDs:

```env
NEXT_PUBLIC_QUID_STORE_ID=<STORE_ID_OR_PLACEHOLDER>
NEXT_PUBLIC_QUID_REPUTATION_ID=<REP_ID_OR_PLACEHOLDER>
NEXT_PUBLIC_QUID_MILESTONE_ID=<MILESTONE_ID_OR_PLACEHOLDER>
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_FRIENDBOT_URL=https://friendbot.stellar.org
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Install dependencies and start the Next.js development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Troubleshooting & Common Pitfalls

### 1. Port Conflicts & CORS Errors
- **Issue:** Frontend shows network/CORS error when calling API (`http://localhost:3001`).
- **Fix:** Verify backend is running on port `3001` (check `PORT=3001` in `backend/.env`). If backend runs on port `3000` by accident, it will collide with Next.js. Backend CORS is enabled by default via `app.enableCors()`.

### 2. Freighter Network Mismatch or Unfunded Account
- **Issue:** Freighter transactions fail or reject immediately.
- **Fix:**
  - Verify Freighter network is set to **Testnet** (not Mainnet or Futurenet).
  - Ensure the active account has sufficient testnet XLM for transaction fees and minimum reserve balances.

### 3. PostgreSQL / Prisma Connection Refused
- **Issue:** `PrismaClientInitializationError: Can't reach database server at localhost:5432`.
- **Fix:**
  - Ensure Docker container is running: `cd backend && docker compose ps`.
  - Restart container if needed: `docker compose down && docker compose up -d`.
  - Check database credentials in `backend/.env` match `docker-compose.yml` (`quid:quid@localhost:5432/quid_dev`).

### 4. Contract Invocation Errors
- **Issue:** Contract call reverts or contract not found.
- **Fix:** Ensure contract IDs in `frontend/.env.local` match the exact addresses output during `stellar contract deploy` on Testnet (starting with `C...`).

## Roles

### Founders (creators)

Create a mission (title, dApp URL, reward per hunter, max participants), escrow funds, review submissions, approve payouts.

### Hunters (users)

Browse the mission board, submit feedback + proof, get paid in USDC/XLM when approved.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Pick issues labeled `good first issue`, `help wanted`, or `priority`.

## License

See the repository license file.
