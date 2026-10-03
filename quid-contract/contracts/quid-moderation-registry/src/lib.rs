#![no_std]
//! Shared on-chain moderation registry (#305).
//!
//! Holds two lists that store gates (e.g. `quid-store::submit_feedback`) read
//! before accepting a submission:
//! - **bans** — permanent until a moderator calls `unban`;
//! - **mutes** — temporary; a mute stops applying once the ledger timestamp
//!   reaches its `until` value (no clean-up transaction needed).
//!
//! Invariants:
//! 1. Only the admin grants/revokes the moderator role (`set_moderator`).
//! 2. Only the admin or an *active* moderator can ban, unban, mute or unmute;
//!    the acting address must authorize the call. A revoked moderator loses
//!    these rights immediately.
//! 3. The admin itself cannot be banned or muted, so the registry can always
//!    be recovered.
//! 4. `can_submit(addr)` is `false` exactly when `addr` is banned or has an
//!    unexpired mute — this is the single check store gates rely on.

use soroban_sdk::{contract, contractevent, contractimpl, Address, Env};

mod error;
mod types;

pub use error::ModerationError;
pub use types::{BanRecord, DataKey, MuteRecord};

/// ~1 year of ledgers; moderation entries must outlive the missions they gate.
const ENTRY_TTL_LEDGERS: u32 = 5_184_000;

#[contractevent(topics = ["mod", "role"])]
pub struct ModeratorSetEvent {
    pub moderator: Address,
    pub active: bool,
}

#[contractevent(topics = ["mod", "ban"])]
pub struct BanEvent {
    pub target: Address,
    pub moderator: Address,
}

#[contractevent(topics = ["mod", "unban"])]
pub struct UnbanEvent {
    pub target: Address,
    pub moderator: Address,
}

#[contractevent(topics = ["mod", "mute"])]
pub struct MuteEvent {
    pub target: Address,
    pub moderator: Address,
    pub until: u64,
}

#[contractevent(topics = ["mod", "unmute"])]
pub struct UnmuteEvent {
    pub target: Address,
    pub moderator: Address,
}

#[contract]
pub struct QuidModerationRegistryContract;

#[contractimpl]
impl QuidModerationRegistryContract {
    /// One-time setup. The admin manages the moderator role.
    pub fn initialize(env: Env, admin: Address) -> Result<(), ModerationError> {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ModerationError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    pub fn get_admin(env: Env) -> Result<Address, ModerationError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ModerationError::NotInitialized)
    }

    /// Grant (`active = true`) or revoke (`active = false`) the moderator role.
    /// Admin only.
    pub fn set_moderator(
        env: Env,
        moderator: Address,
        active: bool,
    ) -> Result<(), ModerationError> {
        let admin = Self::get_admin(env.clone())?;
        admin.require_auth();

        let key = DataKey::Moderator(moderator.clone());
        if active {
            env.storage().persistent().set(&key, &true);
            env.storage()
                .persistent()
                .extend_ttl(&key, ENTRY_TTL_LEDGERS, ENTRY_TTL_LEDGERS);
        } else {
            env.storage().persistent().remove(&key);
        }

        ModeratorSetEvent { moderator, active }.publish(&env);
        Ok(())
    }

    /// `true` for the admin and for addresses holding the moderator role.
    pub fn is_moderator(env: Env, address: Address) -> bool {
        if let Some(admin) = env.storage().instance().get::<_, Address>(&DataKey::Admin) {
            if admin == address {
                return true;
            }
        }
        env.storage()
            .persistent()
            .get(&DataKey::Moderator(address))
            .unwrap_or(false)
    }

    /// Ban `target` until a moderator unbans it.
    pub fn ban(env: Env, moderator: Address, target: Address) -> Result<(), ModerationError> {
        Self::require_moderator(&env, &moderator)?;
        Self::reject_admin_target(&env, &target)?;

        let key = DataKey::Banned(target.clone());
        if env.storage().persistent().has(&key) {
            return Err(ModerationError::AlreadyBanned);
        }
        let record = BanRecord {
            moderator: moderator.clone(),
            banned_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, ENTRY_TTL_LEDGERS, ENTRY_TTL_LEDGERS);

        BanEvent { target, moderator }.publish(&env);
        Ok(())
    }

    /// Lift a ban.
    pub fn unban(env: Env, moderator: Address, target: Address) -> Result<(), ModerationError> {
        Self::require_moderator(&env, &moderator)?;

        let key = DataKey::Banned(target.clone());
        if !env.storage().persistent().has(&key) {
            return Err(ModerationError::NotBanned);
        }
        env.storage().persistent().remove(&key);

        UnbanEvent { target, moderator }.publish(&env);
        Ok(())
    }

    pub fn is_banned(env: Env, address: Address) -> bool {
        env.storage().persistent().has(&DataKey::Banned(address))
    }

    pub fn get_ban(env: Env, address: Address) -> Option<BanRecord> {
        env.storage().persistent().get(&DataKey::Banned(address))
    }

    /// Mute `target` until ledger timestamp `until` (exclusive). Re-muting
    /// replaces the previous expiry, so a mute can be extended or shortened.
    pub fn mute(
        env: Env,
        moderator: Address,
        target: Address,
        until: u64,
    ) -> Result<(), ModerationError> {
        Self::require_moderator(&env, &moderator)?;
        Self::reject_admin_target(&env, &target)?;
        if until <= env.ledger().timestamp() {
            return Err(ModerationError::InvalidMuteExpiry);
        }

        let key = DataKey::Muted(target.clone());
        let record = MuteRecord {
            moderator: moderator.clone(),
            until,
        };
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, ENTRY_TTL_LEDGERS, ENTRY_TTL_LEDGERS);

        MuteEvent {
            target,
            moderator,
            until,
        }
        .publish(&env);
        Ok(())
    }

    /// Lift a mute before it expires.
    pub fn unmute(env: Env, moderator: Address, target: Address) -> Result<(), ModerationError> {
        Self::require_moderator(&env, &moderator)?;

        let key = DataKey::Muted(target.clone());
        if !env.storage().persistent().has(&key) {
            return Err(ModerationError::NotMuted);
        }
        env.storage().persistent().remove(&key);

        UnmuteEvent { target, moderator }.publish(&env);
        Ok(())
    }

    /// `true` while `address` has a mute whose expiry is still in the future.
    pub fn is_muted(env: Env, address: Address) -> bool {
        env.storage()
            .persistent()
            .get::<_, MuteRecord>(&DataKey::Muted(address))
            .is_some_and(|mute| env.ledger().timestamp() < mute.until)
    }

    pub fn get_mute(env: Env, address: Address) -> Option<MuteRecord> {
        env.storage().persistent().get(&DataKey::Muted(address))
    }

    /// Gate check for stores: `false` when `address` is banned or muted.
    pub fn can_submit(env: Env, address: Address) -> bool {
        !Self::is_banned(env.clone(), address.clone()) && !Self::is_muted(env, address)
    }

    /// Require `moderator` to authorize and to hold the admin or moderator role.
    fn require_moderator(env: &Env, moderator: &Address) -> Result<(), ModerationError> {
        moderator.require_auth();
        if !Self::is_moderator(env.clone(), moderator.clone()) {
            return Err(ModerationError::NotModerator);
        }
        Ok(())
    }

    fn reject_admin_target(env: &Env, target: &Address) -> Result<(), ModerationError> {
        if Self::get_admin(env.clone())? == *target {
            return Err(ModerationError::CannotModerateAdmin);
        }
        Ok(())
    }
}

#[cfg(test)]
mod test;
