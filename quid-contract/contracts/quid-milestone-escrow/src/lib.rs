#![no_std]
use soroban_sdk::{contract, contractevent, contractimpl, token, Address, Env, String};

mod error;
mod types;

use error::MilestoneEscrowError;
use types::{DataKey, Milestone, MilestoneStatus, Program, ProgramStatus};

#[contractevent(topics = ["program", "created"])]
pub struct ProgramCreatedEvent {
    pub program_id: u64,
    pub sponsor: Address,
    pub recipient: Address,
}

#[contractevent(topics = ["program", "status"])]
pub struct ProgramStatusChangedEvent {
    pub program_id: u64,
    pub status: ProgramStatus,
}

#[contractevent(topics = ["milestone", "added"])]
pub struct MilestoneAddedEvent {
    pub program_id: u64,
    pub milestone_id: u64,
    pub amount: i128,
}

#[contractevent(topics = ["milestone", "paid"])]
pub struct MilestonePaidEvent {
    pub program_id: u64,
    pub milestone_id: u64,
    pub amount: i128,
    pub recipient: Address,
}

#[contractevent(topics = ["program", "cancelled"])]
pub struct ProgramCancelledEvent {
    pub program_id: u64,
    pub sponsor: Address,
    pub refund_amount: i128,
}

#[contract]
pub struct QuidMilestoneEscrowContract;

#[contractimpl]
impl QuidMilestoneEscrowContract {
    // ── Admin ─────────────────────────────────────────────────────────────
    //
    // Issue #293: the status setters below used to be callable by anyone, so
    // an outsider could overwrite escrow status state. They are now gated on a
    // contract admin, stored once by `initialize` (same pattern as
    // quid-fee-collector / quid-badge-nft).

    /// Set the contract admin. Can only run once, and the admin must sign so
    /// nobody can front-run initialisation with someone else's address.
    pub fn initialize(env: Env, admin: Address) -> Result<(), MilestoneEscrowError> {
        admin.require_auth();

        if env.storage().instance().has(&DataKey::Admin) {
            return Err(MilestoneEscrowError::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    pub fn get_admin(env: Env) -> Result<Address, MilestoneEscrowError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(MilestoneEscrowError::NotInitialized)
    }

    /// Hand admin rights to `new_admin`. Current admin only.
    pub fn set_admin(
        env: Env,
        caller: Address,
        new_admin: Address,
    ) -> Result<(), MilestoneEscrowError> {
        Self::require_admin(&env, &caller)?;
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        Ok(())
    }

    // ── Status helpers ────────────────────────────────────────────────────

    pub fn get_program_status(env: Env) -> ProgramStatus {
        env.storage()
            .instance()
            .get(&DataKey::ProgramStatus)
            .unwrap_or_default()
    }

    /// Admin only (issue #293). `caller` must sign and must be the stored
    /// admin; otherwise the call fails and the stored status is unchanged.
    /// Per-program status is not touched here: it only moves through the
    /// sponsor/reviewer-gated create / approve / cancel flows.
    pub fn set_program_status(
        env: Env,
        caller: Address,
        status: ProgramStatus,
    ) -> Result<(), MilestoneEscrowError> {
        Self::require_admin(&env, &caller)?;
        env.storage()
            .instance()
            .set(&DataKey::ProgramStatus, &status);
        Ok(())
    }

    pub fn get_milestone_status(env: Env) -> MilestoneStatus {
        env.storage()
            .instance()
            .get(&DataKey::MilestoneStatus)
            .unwrap_or_default()
    }

    /// Admin only (issue #293). Same rules as `set_program_status`.
    pub fn set_milestone_status(
        env: Env,
        caller: Address,
        status: MilestoneStatus,
    ) -> Result<(), MilestoneEscrowError> {
        Self::require_admin(&env, &caller)?;
        env.storage()
            .instance()
            .set(&DataKey::MilestoneStatus, &status);
        Ok(())
    }

    pub fn get_program_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ProgramCount)
            .unwrap_or(0_u64)
    }

    // ── Core methods ──────────────────────────────────────────────────────

    pub fn create_program(
        env: Env,
        sponsor: Address,
        recipient: Address,
        token: Address,
        total_amount: i128,
        reviewer: Option<Address>,
        metadata_cid: Option<String>,
    ) -> Result<u64, MilestoneEscrowError> {
        sponsor.require_auth();

        if total_amount <= 0 {
            return Err(MilestoneEscrowError::InvalidAmount);
        }

        token::Client::new(&env, &token).transfer(
            &sponsor,
            env.current_contract_address(),
            &total_amount,
        );

        let mut count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ProgramCount)
            .unwrap_or(0);
        count += 1;
        env.storage().instance().set(&DataKey::ProgramCount, &count);

        let program_id = count;
        let created_at = env.ledger().timestamp();

        let program = Program {
            id: program_id,
            sponsor: sponsor.clone(),
            recipient: recipient.clone(),
            reviewer,
            token,
            total_amount,
            allocated_amount: 0,
            released_amount: 0,
            milestone_count: 0,
            metadata_cid,
            created_at,
            status: ProgramStatus::Active,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Program(program_id), &program);

        ProgramCreatedEvent {
            program_id,
            sponsor,
            recipient,
        }
        .publish(&env);

        ProgramStatusChangedEvent {
            program_id,
            status: ProgramStatus::Active,
        }
        .publish(&env);

        Ok(program_id)
    }

    pub fn get_program(env: Env, program_id: u64) -> Result<Program, MilestoneEscrowError> {
        env.storage()
            .persistent()
            .get(&DataKey::Program(program_id))
            .ok_or(MilestoneEscrowError::ProgramNotFound)
    }

    pub fn add_milestone(
        env: Env,
        program_id: u64,
        title: String,
        amount: i128,
        due_at: u64,
        metadata_cid: String,
    ) -> Result<u64, MilestoneEscrowError> {
        let mut program = Self::get_program(env.clone(), program_id)?;
        program.sponsor.require_auth();

        if program.status != ProgramStatus::Active {
            return Err(MilestoneEscrowError::InvalidState);
        }

        if amount <= 0 {
            return Err(MilestoneEscrowError::InvalidAmount);
        }

        let allocated_amount = program
            .allocated_amount
            .checked_add(amount)
            .ok_or(MilestoneEscrowError::InvalidAmount)?;
        if allocated_amount > program.total_amount {
            return Err(MilestoneEscrowError::InvalidAmount);
        }

        let milestone_id = program.milestone_count + 1;
        let milestone = Milestone {
            id: milestone_id,
            program_id,
            title,
            amount,
            due_at,
            metadata_cid,
            status: MilestoneStatus::Pending,
        };

        program.allocated_amount = allocated_amount;
        program.milestone_count = milestone_id;

        env.storage()
            .persistent()
            .set(&DataKey::Milestone(program_id, milestone_id), &milestone);
        env.storage()
            .persistent()
            .set(&DataKey::Program(program_id), &program);

        MilestoneAddedEvent {
            program_id,
            milestone_id,
            amount,
        }
        .publish(&env);

        Ok(milestone_id)
    }

    pub fn get_milestone(
        env: Env,
        program_id: u64,
        milestone_id: u64,
    ) -> Result<Milestone, MilestoneEscrowError> {
        env.storage()
            .persistent()
            .get(&DataKey::Milestone(program_id, milestone_id))
            .ok_or(MilestoneEscrowError::MilestoneNotFound)
    }

    pub fn approve_milestone(
        env: Env,
        program_id: u64,
        milestone_id: u64,
        approver: Address,
    ) -> Result<(), MilestoneEscrowError> {
        approver.require_auth();

        let mut program = Self::get_program(env.clone(), program_id)?;

        let is_sponsor = approver == program.sponsor;
        let is_reviewer = program.reviewer.as_ref() == Some(&approver);
        if !is_sponsor && !is_reviewer {
            return Err(MilestoneEscrowError::NotAuthorized);
        }

        if program.status != ProgramStatus::Active {
            return Err(MilestoneEscrowError::InvalidState);
        }

        let mut milestone = Self::get_milestone(env.clone(), program_id, milestone_id)?;
        if milestone.status != MilestoneStatus::Pending {
            return Err(MilestoneEscrowError::InvalidState);
        }

        let paid_amount = milestone.amount;

        token::Client::new(&env, &program.token).transfer(
            &env.current_contract_address(),
            &program.recipient,
            &paid_amount,
        );

        milestone.status = MilestoneStatus::Paid;
        env.storage()
            .persistent()
            .set(&DataKey::Milestone(program_id, milestone_id), &milestone);

        program.released_amount = program
            .released_amount
            .checked_add(paid_amount)
            .ok_or(MilestoneEscrowError::InvalidAmount)?;

        let recipient = program.recipient.clone();

        MilestonePaidEvent {
            program_id,
            milestone_id,
            amount: paid_amount,
            recipient,
        }
        .publish(&env);

        if program.released_amount >= program.total_amount {
            program.status = ProgramStatus::Completed;
            ProgramStatusChangedEvent {
                program_id,
                status: ProgramStatus::Completed,
            }
            .publish(&env);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Program(program_id), &program);

        Ok(())
    }

    pub fn cancel_program(
        env: Env,
        program_id: u64,
        sponsor: Address,
    ) -> Result<(), MilestoneEscrowError> {
        sponsor.require_auth();

        let mut program = Self::get_program(env.clone(), program_id)?;

        if sponsor != program.sponsor {
            return Err(MilestoneEscrowError::NotAuthorized);
        }

        if program.status != ProgramStatus::Active {
            return Err(MilestoneEscrowError::InvalidState);
        }

        let refund_amount = program.total_amount - program.released_amount;
        if refund_amount > 0 {
            token::Client::new(&env, &program.token).transfer(
                &env.current_contract_address(),
                &program.sponsor,
                &refund_amount,
            );
        }

        program.status = ProgramStatus::Cancelled;
        env.storage()
            .persistent()
            .set(&DataKey::Program(program_id), &program);

        ProgramCancelledEvent {
            program_id,
            sponsor: program.sponsor.clone(),
            refund_amount,
        }
        .publish(&env);

        ProgramStatusChangedEvent {
            program_id,
            status: ProgramStatus::Cancelled,
        }
        .publish(&env);

        Ok(())
    }

    // ── Internal ──────────────────────────────────────────────────────────

    /// Issue #293: `caller` must authorise the invocation (`require_auth`) AND
    /// be the stored admin. Signing alone is not enough, and neither is
    /// passing the admin's address without the admin's signature.
    fn require_admin(env: &Env, caller: &Address) -> Result<(), MilestoneEscrowError> {
        caller.require_auth();

        let admin = Self::get_admin(env.clone())?;
        if *caller != admin {
            return Err(MilestoneEscrowError::NotAuthorized);
        }

        Ok(())
    }
}

mod test;
