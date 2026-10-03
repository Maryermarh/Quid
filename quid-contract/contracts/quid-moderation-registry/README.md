# quid-moderation-registry

Shared on-chain moderation lists (#305) that store gates read before accepting
work: **banned** addresses and **muted** submitters.

## Roles

| Role | Can |
|------|-----|
| Admin (set once by `initialize`) | grant/revoke moderators; everything a moderator can do |
| Moderator (`set_moderator(addr, true)`) | `ban`, `unban`, `mute`, `unmute` |
| Anyone | `is_banned`, `is_muted`, `can_submit`, `get_ban`, `get_mute`, `is_moderator` |

The acting moderator must authorize each call, and a revoked moderator loses
its rights immediately. The admin cannot be banned or muted.

## Entrypoints

- `initialize(admin)` / `get_admin()`
- `set_moderator(moderator, active)` / `is_moderator(address)`
- `ban(moderator, target)` / `unban(moderator, target)` / `is_banned(address)` / `get_ban(address)`
- `mute(moderator, target, until)` / `unmute(moderator, target)` / `is_muted(address)` / `get_mute(address)`
  — a mute stops applying once the ledger timestamp reaches `until`.
- `can_submit(address)` — `false` while `address` is banned or muted. This is
  the single check store gates call.

## Wiring into `quid-store`

```bash
stellar contract invoke --id <STORE_CONTRACT_ID> --source alice --network testnet -- \
  set_moderation_registry --new_registry <MODERATION_REGISTRY_CONTRACT_ID>
```

Once set, `submit_feedback` rejects banned or muted hunters with
`QuidError::HunterBanned` (#19). Stores without a registry are unaffected.
The slot follows the store's usual handover rule: the first caller must
authorize as the new registry, and afterwards only the current registry can
move it.

## Errors

| Code | Error |
|------|-------|
| 1 | `AlreadyInitialized` |
| 2 | `NotInitialized` |
| 3 | `NotModerator` |
| 4 | `AlreadyBanned` |
| 5 | `NotBanned` |
| 6 | `NotMuted` |
| 7 | `InvalidMuteExpiry` |
| 8 | `CannotModerateAdmin` |
