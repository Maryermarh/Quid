#![no_std]
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractclient, contractevent, contractimpl, contracttype, vec, Address, Env,
    IntoVal, String, Symbol,
};

mod error;
mod types;

use error::QuidError;
use soroban_sdk::token;
use types::{DataKey, Mission, MissionStatus, Submission, SubmissionStatus};

#[contractevent(topics = ["mission", "create"])]
pub struct MissionCreateEvent {
    pub mission_id: u64,
    pub owner: Address,
}

#[contractevent(topics = ["sub", "new"])]
pub struct SubNewEvent {
    pub mission_id: u64,
    pub hunter: Address,
}

#[contractevent(topics = ["payout", "done"])]
pub struct PayoutDoneEvent {
    pub mission_id: u64,
    pub hunter: Address,
}

#[contractevent(topics = ["sub", "reject"])]
pub struct SubmissionRejectedEvent {
    pub mission_id: u64,
    pub hunter: Address,
    pub stake_refunded: i128,
}

#[contractevent(topics = ["mission", "cancel"], data_format = "single-value")]
pub struct MissionCancelEvent {
    pub mission_id: u64,
}

#[contracttype]
pub struct Reward {
    pub reward_token: Address,
    pub reward_amount: i128,
}

#[contracttype]
pub struct MinAsset {
    pub min_asset_token: Option<Address>,
    pub min_asset_amount: i128,
}

#[contractevent(topics = ["mission", "pause"], data_format = "single-value")]
pub struct MissionPauseEvent {
    pub mission_id: u64,
}

#[contractevent(topics = ["fee", "charged"])]
pub struct FeeChargedEvent {
    pub mission_id: u64,
    pub token: Address,
    pub amount: i128,
}

/// Subset of `quid-fee-collector` this contract calls.
///
/// Declared as a client interface rather than a crate dependency so the store
/// wasm stays free of the collector's code.
#[contractclient(name = "FeeCollectorClient")]
pub trait FeeCollector {
    /// Fee owed on `gross_amount` at the vault's current rate.
    fn compute_fee(env: Env, gross_amount: i128) -> i128;

    /// Pull an exact fee amount from `from` into the vault.
    fn deposit_fee(env: Env, from: Address, token: Address, amount: i128);
}

/// Subset of `quid-staking` used by the store. The pool only accepts calls
/// from lockers it has explicitly allow-listed.
#[contractclient(name = "StakingPoolClient")]
pub trait StakingPool {
    fn lock_for_mission(
        env: Env,
        locker: Address,
        mission_id: u64,
        hunter: Address,
        token_address: Address,
        amount: i128,
    );
    fn unlock_for_mission(
        env: Env,
        locker: Address,
        mission_id: u64,
        hunter: Address,
        token_address: Address,
    );
    fn slash_for_mission(
        env: Env,
        locker: Address,
        mission_id: u64,
        hunter: Address,
        token_address: Address,
    );
}

#[contract]
pub struct QuidStoreContract;

#[contractimpl]
impl QuidStoreContract {
    /// Create mission
    pub fn create_mission(
        env: Env,
        owner: Address,
        title: String,
        description_cid: String,
        reward: Reward,
        max_participants: u32,
        min_asset: MinAsset,
    ) -> Result<u64, QuidError> {
        owner.require_auth();

        Self::validate_mission_params(&title, reward.reward_amount)?;

        // Validate optional asset gating
        if min_asset.min_asset_token.is_some() && min_asset.min_asset_amount <= 0 {
            return Err(QuidError::InvalidAmount);
        }

        let total_needed: i128 = reward
            .reward_amount
            .checked_mul(max_participants as i128)
            .ok_or(QuidError::NegativeReward)?;

        // The protocol fee is charged on top of the escrow, so the full reward
        // pool stays available to hunters. Zero when no collector is configured.
        let fee = Self::quote_protocol_fee(&env, total_needed)?;
        let owner_debit = total_needed
            .checked_add(fee)
            .ok_or(QuidError::NegativeReward)?;

        let token_client = token::Client::new(&env, &reward.reward_token);
        token_client.transfer(&owner, env.current_contract_address(), &owner_debit);

        let mission_id = Self::get_next_mission_id(&env);

        let created_at = env.ledger().timestamp();

        // let reward = Reward {
        //     reward_token,
        //     reward_amount
        // }

        let mission = Mission {
            id: mission_id,
            owner: owner.clone(),
            title,
            description_cid,
            reward_token: reward.reward_token,
            reward_amount: reward.reward_amount,
            max_participants,
            participants_count: 0,
            status: MissionStatus::Open,
            created_at,
            min_asset: min_asset.min_asset_token,
            min_asset_amount: min_asset.min_asset_amount,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Mission(mission_id), &mission);

        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Mission(mission_id), 5184000, 5184000);

        if fee > 0 {
            let collector = Self::get_fee_collector(env.clone())?;
            Self::forward_fee(&env, &collector, &mission.reward_token, fee);

            FeeChargedEvent {
                mission_id,
                token: mission.reward_token,
                amount: fee,
            }
            .publish(&env);
        }

        MissionCreateEvent { mission_id, owner }.publish(&env);

        Ok(mission_id)
    }

    /// Get mission
    pub fn get_mission(env: Env, mission_id: u64) -> Result<Mission, QuidError> {
        env.storage()
            .persistent()
            .get(&DataKey::Mission(mission_id))
            .ok_or(QuidError::MissionNotFound)
    }

    /// Get a single hunter submission, including its current review status.
    pub fn get_submission(
        env: Env,
        mission_id: u64,
        hunter: Address,
    ) -> Result<Submission, QuidError> {
        env.storage()
            .persistent()
            .get(&DataKey::Submission(mission_id, hunter))
            .ok_or(QuidError::SubmissionNotFound)
    }

    /// Submit Feedback
    pub fn submit_feedback(
        env: Env,
        mission_id: u64,
        hunter: Address,
        ipfs_cid: String,
        stake_token: Address,
        stake_amount: i128,
    ) -> Result<(), QuidError> {
        hunter.require_auth();

        let mission = Self::get_mission(env.clone(), mission_id)?;

        if mission.status != MissionStatus::Open && mission.status != MissionStatus::Started {
            return Err(QuidError::MissionNotOpen);
        }
        if mission.participants_count >= mission.max_participants {
            return Err(QuidError::MissionFull);
        }

        // Check asset gating requirement
        if let Some(asset_address) = &mission.min_asset {
            let asset_client = token::Client::new(&env, asset_address);
            let current_balance = asset_client.balance(&hunter);
            if current_balance < mission.min_asset_amount {
                return Err(QuidError::InsufficientAssetBalance);
            }
        }

        let key = DataKey::Submission(mission_id, hunter.clone());

        if env.storage().persistent().has(&key) {
            return Err(QuidError::AlreadySubmitted);
        }

        if stake_amount <= 0 {
            return Err(QuidError::InvalidAmount);
        }

        if let Some(pool) = Self::staking_pool(&env) {
            StakingPoolClient::new(&env, &pool).lock_for_mission(
                &env.current_contract_address(),
                &mission_id,
                &hunter,
                &stake_token,
                &stake_amount,
            );
        } else {
            let token_client = token::Client::new(&env, &stake_token);
            token_client.transfer(&hunter, env.current_contract_address(), &stake_amount);
        }

        let stake_key = DataKey::HunterStake(mission_id, hunter.clone());
        env.storage().persistent().set(&stake_key, &stake_amount);
        env.storage()
            .persistent()
            .extend_ttl(&stake_key, 5184000, 5184000);

        let submission = Submission {
            hunter: hunter.clone(),
            ipfs_cid,
            status: SubmissionStatus::Pending,
            submitted_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &submission);
        env.storage()
            .persistent()
            .extend_ttl(&key, 5184000, 5184000);

        SubNewEvent { mission_id, hunter }.publish(&env);

        Ok(())
    }

    /// Update Submission
    pub fn update_submission(
        env: Env,
        mission_id: u64,
        hunter: Address,
        new_ipfs_cid: String,
    ) -> Result<(), QuidError> {
        hunter.require_auth();

        let mission = Self::get_mission(env.clone(), mission_id)?;

        if mission.status != MissionStatus::Open {
            return Err(QuidError::MissionNotOpen);
        }

        let key = DataKey::Submission(mission_id, hunter.clone());

        if !env.storage().persistent().has(&key) {
            return Err(QuidError::SubmissionNotFound);
        }

        let submission: Submission = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(QuidError::SubmissionNotFound)?;

        if submission.status == SubmissionStatus::Paid {
            return Err(QuidError::AlreadyPaid);
        }
        if submission.status == SubmissionStatus::Rejected {
            return Err(QuidError::AlreadyRejected);
        }

        let updated_submission = Submission {
            hunter: submission.hunter,
            ipfs_cid: new_ipfs_cid,
            status: submission.status,
            submitted_at: submission.submitted_at,
        };

        env.storage().persistent().set(&key, &updated_submission);
        env.storage()
            .persistent()
            .extend_ttl(&key, 5184000, 5184000);

        Ok(())
    }

    /// Payout Participant
    pub fn payout_participant(env: Env, mission_id: u64, hunter: Address) -> Result<(), QuidError> {
        let mut mission = Self::get_mission(env.clone(), mission_id)?;
        mission.owner.require_auth();

        if matches!(
            mission.status,
            MissionStatus::Completed | MissionStatus::Cancelled
        ) {
            return Err(QuidError::MissionClosed);
        }

        let key = DataKey::Submission(mission_id, hunter.clone());
        let mut submission: Submission = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(QuidError::SubmissionNotFound)?;

        if submission.status == SubmissionStatus::Paid {
            return Err(QuidError::AlreadyPaid);
        }
        if submission.status != SubmissionStatus::Pending {
            return Err(QuidError::NotPending);
        }

        let token_client = token::Client::new(&env, &mission.reward_token);
        token_client.transfer(
            &env.current_contract_address(),
            &hunter,
            &mission.reward_amount,
        );

        Self::release_stake(
            &env,
            mission_id,
            hunter.clone(),
            mission.reward_token.clone(),
        );

        submission.status = SubmissionStatus::Paid;
        env.storage().persistent().set(&key, &submission);

        mission.participants_count += 1;
        if mission.max_participants > 0 && mission.participants_count >= mission.max_participants {
            mission.status = MissionStatus::Completed;
        }
        env.storage()
            .persistent()
            .set(&DataKey::Mission(mission_id), &mission);

        PayoutDoneEvent { mission_id, hunter }.publish(&env);

        Ok(())
    }

    /// Reject a pending submission and hand the hunter's stake back.
    ///
    /// Owner-only, mirroring `payout_participant`. A rejected submission is
    /// final: it can neither be updated, paid, nor rejected again, and the slot
    /// stays free for another hunter. Rejecting is the polite path — the stake
    /// is returned in full, so use `slash_hunter_stake` for spam.
    pub fn reject_submission(env: Env, mission_id: u64, hunter: Address) -> Result<(), QuidError> {
        let mission = Self::get_mission(env.clone(), mission_id)?;
        mission.owner.require_auth();

        if matches!(
            mission.status,
            MissionStatus::Completed | MissionStatus::Cancelled
        ) {
            return Err(QuidError::MissionClosed);
        }

        let key = DataKey::Submission(mission_id, hunter.clone());
        let mut submission: Submission = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(QuidError::SubmissionNotFound)?;

        if submission.status == SubmissionStatus::Paid {
            return Err(QuidError::AlreadyPaid);
        }
        if submission.status == SubmissionStatus::Rejected {
            return Err(QuidError::AlreadyRejected);
        }
        if submission.status != SubmissionStatus::Pending {
            return Err(QuidError::NotPending);
        }

        let stake_refunded =
            Self::release_stake(&env, mission_id, hunter.clone(), mission.reward_token);

        submission.status = SubmissionStatus::Rejected;
        env.storage().persistent().set(&key, &submission);
        env.storage()
            .persistent()
            .extend_ttl(&key, 5184000, 5184000);

        SubmissionRejectedEvent {
            mission_id,
            hunter,
            stake_refunded,
        }
        .publish(&env);

        Ok(())
    }

    pub fn cancel_mission(env: Env, mission_id: u64) -> Result<(), QuidError> {
        let mut mission = Self::get_mission(env.clone(), mission_id)?;
        mission.owner.require_auth();

        if matches!(
            mission.status,
            MissionStatus::Cancelled | MissionStatus::Completed
        ) {
            return Err(QuidError::MissionClosed);
        }

        let remaining_slots = mission
            .max_participants
            .saturating_sub(mission.participants_count);
        let refund_amount: i128 = (remaining_slots as i128)
            .checked_mul(mission.reward_amount)
            .ok_or(QuidError::NegativeReward)?;

        if refund_amount > 0 {
            let token_client = token::Client::new(&env, &mission.reward_token);
            token_client.transfer(
                &env.current_contract_address(),
                &mission.owner,
                &refund_amount,
            );
        }

        mission.status = MissionStatus::Cancelled;
        env.storage()
            .persistent()
            .set(&DataKey::Mission(mission_id), &mission);

        MissionCancelEvent { mission_id }.publish(&env);

        Ok(())
    }

    pub fn pause_mission(env: Env, id: u64) -> Result<(), QuidError> {
        let mut mission = Self::get_mission(env.clone(), id)?;
        mission.owner.require_auth();
        mission.status = MissionStatus::Paused;
        env.storage()
            .persistent()
            .set(&DataKey::Mission(id), &mission);

        MissionPauseEvent { mission_id: id }.publish(&env);
        Ok(())
    }

    pub fn update_mission_status(
        env: Env,
        mission_id: u64,
        new_status: MissionStatus,
    ) -> Result<(), QuidError> {
        let mut mission = Self::get_mission(env.clone(), mission_id)?;
        mission.owner.require_auth();
        mission.status = new_status;
        env.storage()
            .persistent()
            .set(&DataKey::Mission(mission_id), &mission);
        Ok(())
    }

    /// Slash a hunter's stake for spam submissions.
    /// Only the mission owner may invoke this.
    pub fn slash_hunter_stake(
        env: Env,
        mission_id: u64,
        hunter: Address,
        stake_token: Address,
    ) -> Result<(), QuidError> {
        let mission = Self::get_mission(env.clone(), mission_id)?;
        mission.owner.require_auth();
        Self::slash_stake(&env, mission_id, hunter, stake_token)
    }

    /// Configure the reusable hunter stake pool. The pool must separately
    /// allow-list this store with `set_locker` before pooled submissions work.
    pub fn set_staking_pool(env: Env, new_pool: Address) {
        if let Some(current) = Self::staking_pool(&env) {
            current.require_auth();
        } else {
            new_pool.require_auth();
        }
        env.storage()
            .instance()
            .set(&DataKey::StakingPool, &new_pool);
    }

    pub fn get_staking_pool(env: Env) -> Result<Address, QuidError> {
        Self::staking_pool(&env).ok_or(QuidError::StakingPoolNotSet)
    }

    pub fn get_mission_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::MissionCount)
            .unwrap_or(0)
    }

    pub fn mission_exists(env: Env, mission_id: u64) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Mission(mission_id))
    }

    fn validate_mission_params(_title: &String, reward_amount: i128) -> Result<(), QuidError> {
        if reward_amount <= 0 {
            return Err(QuidError::NegativeReward);
        }
        Ok(())
    }

    fn get_next_mission_id(env: &Env) -> u64 {
        let mut count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::MissionCount)
            .unwrap_or(0);
        count += 1;
        env.storage().instance().set(&DataKey::MissionCount, &count);
        count
    }

    fn staking_pool(env: &Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::StakingPool)
    }

    /// Set the protocol treasury address. Must be called by the treasury itself.
    pub fn set_treasury(env: Env, new_treasury: Address) {
        // If a treasury is already set, only the current treasury may update it.
        if let Some(current_treasury) = env
            .storage()
            .instance()
            .get::<_, Address>(&DataKey::Treasury)
        {
            current_treasury.require_auth();
        } else {
            // Initial set: require authorization from the new treasury address.
            new_treasury.require_auth();
        }

        env.storage()
            .instance()
            .set(&DataKey::Treasury, &new_treasury);
    }

    /// Point the store at a `quid-fee-collector` vault.
    ///
    /// Follows the same handover rule as `set_treasury`: the first caller to
    /// claim the slot must authorize as the new collector, and afterwards only
    /// the current collector can move it.
    pub fn set_fee_collector(env: Env, new_collector: Address) {
        if let Some(current) = env
            .storage()
            .instance()
            .get::<_, Address>(&DataKey::FeeCollector)
        {
            current.require_auth();
        } else {
            new_collector.require_auth();
        }

        env.storage()
            .instance()
            .set(&DataKey::FeeCollector, &new_collector);
    }

    /// Get the configured protocol fee vault.
    pub fn get_fee_collector(env: Env) -> Result<Address, QuidError> {
        env.storage()
            .instance()
            .get(&DataKey::FeeCollector)
            .ok_or(QuidError::FeeCollectorNotSet)
    }

    /// Protocol fee owed on `gross_amount`, or zero when no vault is configured.
    ///
    /// Missions created before a collector is set stay fee-free, so wiring the
    /// vault up is a non-breaking change for existing deployments.
    fn quote_protocol_fee(env: &Env, gross_amount: i128) -> Result<i128, QuidError> {
        let Some(collector) = env
            .storage()
            .instance()
            .get::<_, Address>(&DataKey::FeeCollector)
        else {
            return Ok(0);
        };

        let fee = FeeCollectorClient::new(env, &collector).compute_fee(&gross_amount);
        if fee < 0 || fee > gross_amount {
            return Err(QuidError::InvalidAmount);
        }

        Ok(fee)
    }

    /// Hand `fee` (already escrowed here) over to the fee vault.
    ///
    /// The vault pulls the tokens itself, which happens one frame below this
    /// call, so the store has to pre-authorize that nested transfer on its own
    /// behalf — a contract's implicit auth only covers its direct sub-call.
    fn forward_fee(env: &Env, collector: &Address, token: &Address, fee: i128) {
        let store = env.current_contract_address();

        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: token.clone(),
                    fn_name: Symbol::new(env, "transfer"),
                    args: (store.clone(), collector.clone(), fee).into_val(env),
                },
                sub_invocations: vec![env],
            }),
        ]);

        FeeCollectorClient::new(env, collector).deposit_fee(&store, token, &fee);
    }

    /// Get the protocol treasury address.
    pub fn get_treasury(env: Env) -> Result<Address, QuidError> {
        env.storage()
            .instance()
            .get(&DataKey::Treasury)
            .ok_or(QuidError::TreasuryNotSet)
    }

    /// Slash a hunter's stake by sending it to the protocol treasury.
    fn slash_stake(
        env: &Env,
        mission_id: u64,
        hunter: Address,
        stake_token: Address,
    ) -> Result<(), QuidError> {
        let key = DataKey::HunterStake(mission_id, hunter.clone());

        let amount: i128 = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(QuidError::StakeNotFound)?;

        if let Some(pool) = Self::staking_pool(env) {
            StakingPoolClient::new(env, &pool).slash_for_mission(
                &env.current_contract_address(),
                &mission_id,
                &hunter,
                &stake_token,
            );
            env.storage().persistent().remove(&key);
            return Ok(());
        }

        let treasury = Self::get_treasury(env.clone())?;

        token::Client::new(env, &stake_token).transfer(
            &env.current_contract_address(),
            &treasury,
            &amount,
        );

        env.storage().persistent().remove(&key);

        Ok(())
    }

    /// Release a stake lock back to the hunter's available pool balance.
    ///
    /// Returns the amount that was unlocked so callers can report it in an
    /// event. Missing or already-released stakes refund zero.
    fn release_stake(env: &Env, mission_id: u64, hunter: Address, stake_token: Address) -> i128 {
        let key = DataKey::HunterStake(mission_id, hunter.clone());

        if env.storage().persistent().has(&key) {
            if let Some(pool) = Self::staking_pool(env) {
                StakingPoolClient::new(env, &pool).unlock_for_mission(
                    &env.current_contract_address(),
                    &mission_id,
                    &hunter,
                    &stake_token,
                );
                let unlocked: i128 = env.storage().persistent().get(&key).unwrap_or(0);
                env.storage().persistent().remove(&key);
                return unlocked;
            }
        }

        if let Some(amount) = env.storage().persistent().get::<DataKey, i128>(&key) {
            token::Client::new(env, &stake_token).transfer(
                &env.current_contract_address(),
                &hunter,
                &amount,
            );

            env.storage().persistent().remove(&key);

            return amount;
        }

        0
    }
}
mod test;
