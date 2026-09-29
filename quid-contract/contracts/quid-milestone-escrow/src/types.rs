use soroban_sdk::{contracttype, Address, String};

#[derive(Clone, Debug, Default, PartialEq, Eq, Copy)]
#[contracttype]
pub enum ProgramStatus {
    Draft,
    #[default]
    Active,
    Completed,
    Cancelled,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Copy)]
#[contracttype]
pub enum MilestoneStatus {
    #[default]
    Pending,
    Approved,
    Paid,
    Released,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Program {
    pub id: u64,
    pub sponsor: Address,
    pub recipient: Address,
    pub reviewer: Option<Address>,
    pub token: Address,
    pub total_amount: i128,
    pub allocated_amount: i128,
    pub released_amount: i128,
    pub milestone_count: u64,
    pub metadata_cid: Option<String>,
    pub created_at: u64,
    pub status: ProgramStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub id: u64,
    pub program_id: u64,
    pub title: String,
    pub amount: i128,
    pub due_at: u64,
    pub metadata_cid: String,
    pub status: MilestoneStatus,
}

#[contracttype]
pub enum DataKey {
    ProgramStatus,
    MilestoneStatus,
    Program(u64),
    Milestone(u64, u64),
    ProgramCount,
    /// Issue #293: contract admin allowed to mutate the status helpers.
    Admin,
}
