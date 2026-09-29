# Quid Contracts

Soroban (Rust) smart contracts for Quid: bounty escrow, reputation, milestone programs, referrals, disputes, badges, and protocol fees.

## Contracts

| Package | Wasm | Role |
|---------|------|------|
| `quid-store` | `quid_store.wasm` | Mission bounty vault: create, submit, payout, cancel, pause, slash |
| `quid-reputation` | `quid_reputation.wasm` | Admin, profiles, attestations |
| `quid-milestone-escrow` | `quid_milestone_escrow.wasm` | Multi-milestone escrow programs |
| `quid-referral` | `quid_referral.wasm` | Referral attribution + rewards on settled payouts |
| `quid-dispute` | `quid_dispute.wasm` | Contested-submission arbitration: timelock + optional arbiter |
| `quid-badge-nft` | `quid_badge_nft.wasm` | Badge NFTs for completed missions / reputation tiers |
| `quid-fee-collector` | `quid_fee_collector.wasm` | Protocol fee vault: configurable cut, per-token balances, admin withdrawal |
| `quid-mission-factory` | `quid_mission_factory.wasm` | Curated mission templates that launch into configured store instances |
| `hello-world` | `hello_world.wasm` | Scaffold only — safe to ignore |

## Prerequisites

- Rust (stable)
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools) (`stellar`) — use a version compatible with Soroban SDK 23
- Testnet account (Friendbot)

```bash
stellar --version
stellar keys generate alice --network testnet --as-secret
stellar keys fund alice --network testnet
```

## Build

```bash
cd quid-contract
stellar contract build
```

Wasm output:

```text
target/wasm32v1-none/release/quid_store.wasm
target/wasm32v1-none/release/quid_reputation.wasm
target/wasm32v1-none/release/quid_milestone_escrow.wasm
target/wasm32v1-none/release/quid_referral.wasm
target/wasm32v1-none/release/quid_dispute.wasm
target/wasm32v1-none/release/quid_badge_nft.wasm
target/wasm32v1-none/release/quid_fee_collector.wasm
target/wasm32v1-none/release/quid_mission_factory.wasm
```

## Deploy (testnet)

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/quid_store.wasm \
  --source alice \
  --network testnet

stellar contract deploy \
  --wasm target/wasm32v1-none/release/quid_reputation.wasm \
  --source alice \
  --network testnet

stellar contract deploy \
  --wasm target/wasm32v1-none/release/quid_milestone_escrow.wasm \
  --source alice \
  --network testnet

stellar contract deploy \
  --wasm target/wasm32v1-none/release/quid_referral.wasm \
  --source alice \
  --network testnet

stellar contract deploy \
  --wasm target/wasm32v1-none/release/quid_dispute.wasm \
  --source alice \
  --network testnet

stellar contract deploy \
  --wasm target/wasm32v1-none/release/quid_badge_nft.wasm \
  --source alice \
  --network testnet

stellar contract deploy \
  --wasm target/wasm32v1-none/release/quid_fee_collector.wasm \
  --source alice \
  --network testnet

stellar contract deploy \
  --wasm target/wasm32v1-none/release/quid_mission_factory.wasm \
  --source alice \
  --network testnet
```

Copy each `C...` contract ID into `frontend/.env.local`.

### Initialize reputation (once)

```bash
stellar contract invoke \
  --id <REPUTATION_CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- \
  initialize \
  --admin alice
```

Verify:

```bash
stellar contract invoke \
  --id <REPUTATION_CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- \
  get_admin
```

### Initialize referrals (once)

```bash
# 500 bps = 5% of each referred hunter's payout
stellar contract invoke \
  --id <REFERRAL_CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- \
  initialize \
  --admin alice \
  --reward_bps 500

# only this address may report payouts
stellar contract invoke \
  --id <REFERRAL_CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- \
  set_payout_hook \
  --caller alice \
  --payout_hook <STORE_CONTRACT_ID>
```

### Initialize the fee collector (optional, once)

The protocol fee is opt-in: until the store is pointed at a vault,
`create_mission` charges nothing.

```bash
# 250 bps = 2.5%
stellar contract invoke \
  --id <FEE_COLLECTOR_CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- \
  initialize \
  --admin alice \
  --fee_bps 250

stellar contract invoke \
  --id <STORE_CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- \
  set_fee_collector \
  --new_collector <FEE_COLLECTOR_CONTRACT_ID>
```

## Main entrypoints

### `quid-store`

- `create_mission` — escrow rewards, optional asset gate
- `submit_feedback` — hunter stake + IPFS CID
- `payout_participant` — pay hunter, refund stake
- `cancel_mission` / `pause_mission` / `update_mission_status`
- `slash_hunter_stake` / treasury helpers
- `set_fee_collector` / `get_fee_collector` — route the protocol fee to `quid-fee-collector`

### `quid-reputation`

- `initialize` / `get_admin`
- `issue_attestation` / `get_attestation` / `revoke_attestation`
- `set_profile` / `get_profile`

See [contracts/quid-reputation/README.md](./contracts/quid-reputation/README.md).

### `quid-referral`

- `initialize` / `set_reward_bps` / `compute_reward`
- `register_referral` / `get_referral` / `get_referred_count`
- `set_payout_hook` / `record_payout` — accrual gated behind a settled payout
- `fund` / `claim_reward` / `get_claimable` / `get_claimed`

See [contracts/quid-referral/README.md](./contracts/quid-referral/README.md).

### `quid-milestone-escrow`

- `create_program` / `add_milestone` / `approve_milestone` / `cancel_program`
- `initialize` / `get_admin` / `set_admin`
- getters for program / milestone status; `set_program_status` / `set_milestone_status` are admin only

### `quid-dispute`

- `create_dispute` — hunter opens a case, stakes a bond, sets timelock + optional arbiter
- `stake_bond` — hunter adds to their bond, or respondent posts a counter-bond
- `resolve_by_arbiter` — named arbiter awards the pot before the deadline
- `timeout_release` — after the deadline, refund each party's bond
- Events: `DisputeCreatedEvent`, `BondStakedEvent`, `DisputeResolvedEvent`, `DisputeTimeoutEvent`

### `quid-badge-nft`

- `initialize` / `get_admin` / `set_admin`
- `add_minter` / `remove_minter` / `is_minter`
- `mint_badge` / `get_badge` / `list_by_owner`
- `transfer` (transferable badges only) / `burn`

See [contracts/quid-badge-nft/README.md](./contracts/quid-badge-nft/README.md).

### `quid-fee-collector`

- `initialize` / `get_admin` / `set_admin`
- `set_fee_bps` / `get_fee_bps` / `compute_fee`
- `collect_fee` / `deposit_fee`
- `withdraw_fees` / `get_balance` / `get_balances`

See [contracts/quid-fee-collector/README.md](./contracts/quid-fee-collector/README.md).

### `quid-mission-factory`

- `initialize` / `get_admin`
- `register_template` / `get_template` / `list_templates`
- `create_from_template` — launch and fund a mission in the template's store

See [contracts/quid-mission-factory/README.md](./contracts/quid-mission-factory/README.md).

## Tests

```bash
cargo test
# or per package:
cargo test -p quid-store
cargo test -p quid-reputation
cargo test -p quid-milestone-escrow
cargo test -p quid-referral
cargo test -p quid-dispute
cargo test -p quid-badge-nft
cargo test -p quid-fee-collector
cargo test -p quid-mission-factory
```

## Known gaps (good contributor targets)

- `reject_submission` + stake refund on `quid-store`
- Mission expiry / auto-refund
- Store → reputation hook on successful payout (also wires `quid-referral.record_payout`)
- Store/reputation → `quid-badge-nft` `mint_badge` call on successful payout
  (the badge contract already exposes the minter allow-list for it)
- Wire `quid-dispute` into store reject / payout holds
- Remove or archive `hello-world`

## Workspace layout

```text
quid-contract/
├── Cargo.toml                 # workspace (soroban-sdk 23)
└── contracts/
    ├── quid-store/
    ├── quid-reputation/
    ├── quid-milestone-escrow/
    ├── quid-referral/
    ├── quid-dispute/
    ├── quid-badge-nft/
    ├── quid-fee-collector/
    ├── quid-mission-factory/
    └── hello-world/
```

## Related docs

- Root: [../README.md](../README.md)
- Frontend env: [../frontend/README.md](../frontend/README.md)
- Contributing: [../CONTRIBUTING.md](../CONTRIBUTING.md)
