# Submission sync: source of truth (#310)

## Source of truth

**The chain is the source of truth for submissions.** A submission exists
once `quid-store::submit_feedback` succeeds on chain; the backend database is
a read model kept in sync by the indexer. The database never creates a
submission the chain does not have, and never overrides on-chain facts.

| Concern | Authority |
|---------|-----------|
| Whether a submission exists, and its IPFS CID | Chain (`submit_feedback`, `update_submission`) |
| Paid | Chain (`payout_participant`) |
| Approved / Rejected + reason | Backend owner review (`POST /missions/:missionId/submissions/:id/approve` / `reject`) — off-chain today |

## Write paths

```
hunter wallet ──submit_feedback──▶ quid-store ──sub/new event──▶ indexer ──applyChainSubmission──▶ submissions (chain_confirmed = true)
      │
      └──(optional) POST /missions/:id/submissions { ipfsCid, txHash } ──▶ submissions (chain_confirmed = false)
```

1. **Indexer (authoritative):** `SubmissionSyncService.applyChainSubmission`
   upserts the row from on-chain state, sets `chain_confirmed = true`, and
   takes the CID from the chain. The indexer's RPC event polling is tracked
   separately ("Implement quid-store Soroban event indexer"); this is the
   write it calls.
2. **Optimistic API write (optional):** after the hunter's `submit_feedback`
   transaction confirms, the frontend may call
   `POST /missions/:id/submissions` with `{ ipfsCid, txHash }` (JWT required)
   so the submission shows up immediately. The row is `PENDING` with
   `chain_confirmed = false` until the indexer confirms it.

## Invariants

- **One submission per (mission, hunter)**, as on chain (`AlreadySubmitted`):
  enforced by the `submissions_mission_id_hunter_address_key` unique index.
  Concurrent writers (two POSTs, or a POST racing the indexer) resolve
  against the row that won (Prisma `P2002`).
- **Idempotent retries:** repeating the same POST (same CID and tx hash)
  returns the existing row, even if the mission has since been paused. A
  different CID or tx hash for the same (mission, hunter) returns `409`. A tx
  hash can belong to only one submission (`submissions_tx_hash_key`).
- **The hunter is the authenticated wallet** — it is never read from the body
  (extra body fields are rejected).
- **Mission must accept submissions:** `OPEN` or `STARTED`, matching the
  contract's `MissionNotOpen` rule; otherwise `409`.

## Status mapping and transitions

`quid-store` `SubmissionStatus` is `Pending, Approved, Paid, Rejected`
(discriminants 0–3). The Prisma enum has the same names in a different order,
so `fromChainStatus` maps **by name**
(`backend/src/submissions/submission-status.ts`).

| Source | Allowed transitions |
|--------|---------------------|
| Owner review (API) | `PENDING → APPROVED`, `PENDING → REJECTED` |
| Chain (indexer) | `PENDING → PAID`, `APPROVED → PAID`, `REJECTED → PAID` |

- `PAID` is terminal. Same-status updates are no-ops.
- The only on-chain status change is `payout_participant` (`Pending → Paid`).
  Owner review does not write to the chain, so the chain can pay a row that
  is `APPROVED` or `REJECTED` in the database; the chain wins.
- An on-chain `Pending` never undoes an owner's off-chain review.

## API

`POST /missions/:id/submissions` (Bearer JWT)

```json
{ "ipfsCid": "bafy...", "txHash": "<64 hex chars>" }
```

| Status | When |
|--------|------|
| 201 | Row created (`PENDING`, `chainConfirmed: false`) or an identical retry |
| 400 | Invalid CID / tx hash, or unexpected body fields |
| 401 | Missing or invalid JWT |
| 404 | Unknown mission |
| 409 | Mission not `OPEN`/`STARTED`; a different submission already exists for this hunter; tx hash linked to another submission |
